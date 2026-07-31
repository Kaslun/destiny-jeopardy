"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import { keyFor } from "./keys";
import { read, write } from "./storage";
import type { ClientMessage, RoomState, ServerMessage, Role } from "../shared/protocol";

const PARTY_HOST = process.env.NEXT_PUBLIC_PARTY_HOST || "127.0.0.1:8787";

/** Stable per-browser player id, so a refresh rejoins the same seat. */
export function playerId(): string {
  const existing = read("player-id");
  if (existing) return existing;
  // No id, or storage is unavailable (private mode). Either way a fresh one
  // works; if the write below is a no-op the player simply keeps their seat for
  // this tab's lifetime rather than across a reload.
  const id = crypto.randomUUID();
  write("player-id", id);
  return id;
}

export interface Room {
  state: RoomState | null;
  you: string | null;
  connected: boolean;
  error: string | null;
  send: (msg: ClientMessage) => void;
}

/**
 * Connects to one room and keeps the latest server snapshot in state.
 *
 * `join` is read through a ref so callers can pass a fresh object literal each
 * render without the socket tearing down and reconnecting every time.
 */
export function useRoom(room: string, join: Extract<ClientMessage, { type: "join" }>): Room {
  const [state, setState] = useState<RoomState | null>(null);
  const [you, setYou] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<PartySocket | null>(null);
  const joinRef = useRef(join);
  joinRef.current = join;

  useEffect(() => {
    if (!room) return;

    const socket = new PartySocket({
      host: PARTY_HOST,
      party: "jeopardy-room",
      room: room.toUpperCase(),
    });
    socketRef.current = socket;

    const onOpen = () => {
      setConnected(true);
      setError(null);
      socket.send(JSON.stringify(joinRef.current));
    };
    const onClose = () => setConnected(false);
    const onMessage = (event: MessageEvent<string>) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === "state") {
        setState(msg.state);
        setYou(msg.you);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };

    socket.addEventListener("open", onOpen);
    socket.addEventListener("close", onClose);
    socket.addEventListener("message", onMessage);

    return () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("message", onMessage);
      socket.close();
      socketRef.current = null;
    };
  }, [room]);

  const send = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }, []);

  return { state, you, connected, error, send };
}

export function useRole(room: string, role: Role, name?: string, cls?: string): Room {
  const [id] = useState(() => (role === "player" ? playerId() : undefined));
  // Read once: `keyFor` mints and stores a key on first call, and re-running it
  // every render would be pointless churn. Only a host needs one.
  const [hostKey] = useState(() =>
    role === "host" && room ? keyFor("host-key", room.toUpperCase()) : undefined,
  );
  return useRoom(room, { type: "join", role, playerId: id, name, cls, hostKey });
}
