"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";
import { keyFor } from "./keys";
import { read, write } from "./storage";
import type {
  BoardClientMessage,
  BoardOp,
  BoardServerMessage,
  EditorPresence,
  Game,
} from "../shared/protocol";

const PARTY_HOST = process.env.NEXT_PUBLIC_PARTY_HOST || "127.0.0.1:8787";

export interface BoardSession {
  game: Game | null;
  editors: EditorPresence[];
  you: string;
  connected: boolean;
  error: string | null;
  send: (op: BoardOp) => void;
  setFocus: (focus: { catId: string; row: number } | null) => void;
  /** False when this browser lacks the board's edit key. */
  canEdit: boolean;
}

/**
 * Live connection to one saved board. Pass `slug: null` to stay offline — the
 * hook still runs (hooks can't be conditional) but opens no socket, which is
 * how the local-draft editor at `/edit` works.
 */
export function useBoard(slug: string | null, name: string): BoardSession {
  const [game, setGame] = useState<Game | null>(null);
  const [editors, setEditors] = useState<EditorPresence[]>([]);
  const [you, setYou] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Assumed until the board says otherwise, so the editor does not flash
  // read-only on every connect before the access reply lands.
  const [canEdit, setCanEdit] = useState(true);

  const socketRef = useRef<PartySocket | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    if (!slug) return;

    const socket = new PartySocket({
      host: PARTY_HOST,
      party: "board-store",
      room: slug.toUpperCase(),
    });
    socketRef.current = socket;

    const onOpen = () => {
      setConnected(true);
      setError(null);
      socket.send(
        JSON.stringify({
          type: "hello",
          name: nameRef.current,
          key: keyFor("edit-key", slug.toUpperCase()),
        } satisfies BoardClientMessage),
      );
    };
    const onClose = () => setConnected(false);
    const onMessage = (event: MessageEvent<string>) => {
      let msg: BoardServerMessage;
      try {
        msg = JSON.parse(event.data) as BoardServerMessage;
      } catch {
        return;
      }
      if (msg.type === "board") {
        setGame(msg.game);
        setEditors(msg.editors);
        // Only the first message carries our own id; later broadcasts leave it blank.
        if (msg.you) setYou(msg.you);
      } else if (msg.type === "access") {
        setCanEdit(msg.canEdit);
      } else if (msg.type === "editors") {
        setEditors(msg.editors);
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
  }, [slug]);

  // Renaming yourself mid-session should reach the others.
  useEffect(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "hello", name } satisfies BoardClientMessage));
    }
  }, [name]);

  const send = useCallback((op: BoardOp) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "op", op } satisfies BoardClientMessage));
    }
  }, []);

  const setFocus = useCallback((focus: { catId: string; row: number } | null) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "focus", focus } satisfies BoardClientMessage));
    }
  }, []);

  return { game, editors, you, connected, error, send, setFocus, canEdit };
}

export function storedEditorName(): string {
  return read("editor-name") || "";
}

export function storeEditorName(name: string): void {
  write("editor-name", name);
}
