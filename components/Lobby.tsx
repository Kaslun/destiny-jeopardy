"use client";

import { JoinPanel } from "./JoinPanel";
import { Mark } from "./ui";
import { C, CELL, tintFor } from "../lib/theme";
import type { RoomState } from "../shared/protocol";
import type { Theme } from "../lib/themes";

/**
 * The TV before the game starts: how to get in, and who already has. Sized to
 * be read and scanned from across a room.
 */
export function Lobby({ state, room, theme }: { state: RoomState; room: string; theme: Theme }) {
  const players = state.players;
  const title = state.game?.title ?? theme.copy.appName;

  return (
    <main
      style={{
        height: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: "clamp(24px,3.5vw,56px)",
        gap: "clamp(16px,3vh,40px)",
        background: "var(--scene-board)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 18, flex: "none" }}>
        <Mark mark={theme.mark} size={56} />
        <div className="display broadcast" style={{ fontSize: "clamp(26px,2.8vw,48px)" }}>
          {title}
        </div>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)",
          gap: "clamp(24px,4vw,72px)",
          alignItems: "center",
        }}
      >
        <div style={{ display: "grid", placeItems: "center" }}>
          <JoinPanel room={room} size={280} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, minHeight: 0, maxHeight: "100%" }}>
          <div style={{ fontSize: "clamp(16px,1.4vw,24px)", color: C.dim }}>
            {players.length === 0 ? "Waiting for players…" : `${players.length} ${players.length === 1 ? "player" : "players"} in`}
          </div>
          <div
            className="scroll"
            style={{ display: "flex", flexWrap: "wrap", gap: "clamp(8px,0.8vw,14px)", alignContent: "flex-start", minHeight: 0 }}
          >
            {players.map((p, i) => (
              <div
                key={p.id}
                className="anim-pop"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "clamp(10px,1vw,16px) clamp(16px,1.4vw,24px)",
                  borderRadius: "var(--r-btn)",
                  background: CELL,
                  color: C.cellInk,
                  border: "1px solid var(--cell-line)",
                  opacity: p.connected ? 1 : 0.45,
                  animationDelay: `${Math.min(i, 8) * 40}ms`,
                }}
              >
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: tintFor(p.tint ?? i) }} />
                <span className="name-text" style={{ fontSize: "calc(clamp(18px,1.7vw,30px) * var(--name-scale))" }}>
                  {p.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer style={{ flex: "none", textAlign: "center", fontSize: "clamp(13px,1.1vw,18px)", color: C.faint }}>
        {state.game ? "The game starts when the host is ready" : "The host is choosing a quiz"}
      </footer>
    </main>
  );
}
