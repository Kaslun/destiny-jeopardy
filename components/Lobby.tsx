"use client";

import { JoinPanel } from "./JoinPanel";
import { C, mono, SCENE, tintFor } from "../lib/theme";
import type { RoomState } from "../shared/protocol";
import type { Theme } from "../lib/themes";

/**
 * The TV before the game starts: how to get in, and who already has.
 *
 * Everything here is sized to be read and scanned from across a room, which is
 * the whole job — a lobby nobody can join from is just a waiting screen.
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
        padding: "clamp(20px,3vw,44px)",
        gap: "clamp(16px,2.5vh,32px)",
        background: SCENE.board,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 20, flex: "none" }}>
        <div
          style={{
            width: 44,
            height: 44,
            border: `2px solid ${C.accent}`,
            transform: "rotate(45deg)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div style={{ width: 15, height: 15, background: C.accent }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontFamily: mono, fontSize: "clamp(9px,.8vw,13px)", letterSpacing: ".32em", color: C.dim }}>
            {state.game ? "BOARD LOADED · WAITING TO START" : "WAITING FOR THE HOST TO LOAD A BOARD"}
          </div>
          <div style={{ fontSize: "clamp(20px,2vw,34px)", fontWeight: 700, letterSpacing: ".05em", lineHeight: 1 }}>
            {title}
          </div>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
          gap: "clamp(20px,3vw,56px)",
          alignItems: "center",
        }}
      >
        <div style={{ display: "grid", placeItems: "center" }}>
          <JoinPanel room={room} size={260} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0, height: "100%" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flex: "none" }}>
            <div style={{ fontFamily: mono, fontSize: "clamp(10px,.9vw,14px)", letterSpacing: ".3em", color: C.dim }}>
              IN THE ROOM
            </div>
            <div style={{ fontFamily: mono, fontSize: "clamp(18px,1.8vw,30px)", fontWeight: 600, color: C.info }}>
              {players.length}
            </div>
          </div>

          {players.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: "grid",
                placeItems: "center",
                border: `1px dashed ${C.line}`,
                fontFamily: mono,
                fontSize: "clamp(10px,.95vw,15px)",
                letterSpacing: ".22em",
                color: C.faint,
                textAlign: "center",
                lineHeight: 2.2,
                padding: 20,
              }}
            >
              SCAN THE CODE TO JOIN
              <br />
              NOBODY IS HERE YET
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                display: "grid",
                gridTemplateColumns: players.length > 6 ? "1fr 1fr" : "1fr",
                gridAutoRows: "min-content",
                gap: 10,
                alignContent: "start",
              }}
            >
              {players.map((p, i) => (
                <div
                  key={p.id}
                  className="anim-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 18px",
                    background: `linear-gradient(100deg,${C.panel},${C.panelDeep})`,
                    border: `1px solid ${C.line}`,
                    borderLeft: `4px solid ${tintFor(p.tint ?? i)}`,
                    clipPath: "polygon(0 0,100% 0,100% 74%,97% 100%,0 100%)",
                    opacity: p.connected ? 1 : 0.45,
                    animationDelay: `${Math.min(i, 8) * 45}ms`,
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      border: `1px solid ${tintFor(p.tint ?? i)}`,
                      transform: "rotate(45deg)",
                      opacity: 0.6,
                      flex: "none",
                    }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: "clamp(15px,1.5vw,26px)",
                        fontWeight: 600,
                        letterSpacing: ".04em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.name}
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: C.muted }}>
                      {p.connected ? p.cls || "READY" : "AWAY"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer
        style={{
          flex: "none",
          textAlign: "center",
          fontFamily: mono,
          fontSize: "clamp(10px,.9vw,14px)",
          letterSpacing: ".28em",
          color: C.faint,
        }}
      >
        {state.game ? "THE HOST STARTS THE GAME WHEN EVERYONE IS IN" : "THE HOST IS STILL SETTING UP"}
      </footer>
    </main>
  );
}
