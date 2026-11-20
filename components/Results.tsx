"use client";

import { alpha, C, money, tintFor } from "../lib/theme";
import { standings, type RoomState } from "../shared/protocol";
import type { Theme } from "../lib/themes";

/* Gold, silver, bronze. Third place is a literal because bronze is a medal, not
   a role — no theme has an opinion about it and none should. */
const MEDAL = [C.accent, C.text, "#c98a4b"];

/**
 * The closing standings, revealed one place at a time.
 *
 * Places are read out worst-first, so the board fills from the bottom and the
 * top slot stays conspicuously empty until the end. Everyone can see exactly
 * how much is still unclaimed, which is where the tension comes from — a
 * scoreboard that simply appeared would carry none of it.
 */
export function Results({ state, theme }: { state: RoomState; theme: Theme }) {
  const results = state.results!;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const ranked = standings(state.players); // best first

  const revealedIds = new Set(results.order.slice(0, results.revealed));
  const allOut = results.revealed >= results.order.length;
  const winnerId = ranked[0]?.id;
  const winner = winnerId ? byId.get(winnerId) : null;
  // The winner's slot only fills on the very last reveal.
  const winnerOut = allOut && !!winner;

  return (
    <main
      style={{
        height: "100dvh",
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "clamp(18px,3vh,40px) clamp(20px,4vw,60px)",
        gap: "clamp(12px,2vh,26px)",
        background: winnerOut ? "var(--scene-winner)" : "var(--scene-results)",
        transition: "background 1.2s var(--snap)",
      }}
    >
      {winnerOut && (
        <div
          aria-hidden
          className="anim-rays"
          style={{
            position: "absolute",
            top: "-40%",
            left: "50%",
            width: "160vh",
            height: "160vh",
            marginLeft: "-80vh",
            pointerEvents: "none",
            background: `repeating-conic-gradient(from 0deg at 50% 50%, ${alpha(C.accent, 16)} 0deg 7deg, transparent 7deg 20deg)`,
          }}
        />
      )}

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "none" }}>
        <div style={{ fontSize: "clamp(14px,1.3vw,22px)", color: C.dim }}>
          {allOut ? "That's the game" : "Final standings"}
        </div>
        <div
          className="display"
          style={{
            fontSize: "clamp(28px,3.6vw,62px)",
            color: allOut ? C.accent : C.text,
            transition: "color .8s var(--snap)",
          }}
        >
          {state.game?.title ?? theme.copy.appName}
        </div>
      </div>

      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          width: "min(1000px, 96%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "clamp(7px,1.2vh,14px)",
        }}
      >
        {ranked.map((entry, i) => {
          const player = byId.get(entry.id);
          const out = revealedIds.has(entry.id);
          const isWinner = i === 0;
          const medal = MEDAL[entry.rank - 1] ?? C.line;

          if (isWinner && winnerOut) {
            return (
              <div
                key={entry.id}
                className="anim-crown"
                style={{
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  gap: "clamp(14px,2vw,32px)",
                  padding: "clamp(16px,2.4vh,30px) clamp(18px,2.5vw,36px)",
                  borderRadius: "var(--r-lg)",
                  background: `linear-gradient(100deg, ${alpha(C.accent, 22)}, ${alpha(C.accent, 6)})`,
                  border: `2px solid ${C.accent}`,
                  boxShadow: `0 0 70px ${alpha(C.accent, 35)}`,
                }}
              >
                <div
                  className="display num"
                  style={{
                    fontSize: "clamp(26px,4vw,72px)",
                    color: C.accent,
                    width: "2.2ch",
                    textAlign: "center",
                  }}
                >
                  1
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="display"
                    style={{
                      fontSize: "clamp(26px,4.4vw,80px)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {player?.name ?? "—"}
                  </div>
                  <div style={{ fontSize: "clamp(13px,1.2vw,20px)", fontWeight: 600, color: C.accent }}>Winner</div>
                </div>
                <div className="display num" style={{ fontSize: "clamp(22px,3.2vw,58px)", color: C.accent }}>
                  {money(entry.score)}
                </div>
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,.45) 50%, transparent 65%)",
                    // `both` keeps the band off-screen before and after the
                    // sweep; without it it ends parked over the name.
                    animation: "sheen 1.8s var(--snap) .7s both",
                  }}
                />
              </div>
            );
          }

          return (
            <div
              key={entry.id}
              className={out ? "anim-slam shape" : "shape"}
              style={{
                borderRadius: "var(--r-md)",
                display: "flex",
                alignItems: "center",
                gap: "clamp(12px,1.8vw,26px)",
                padding: "clamp(9px,1.5vh,18px) clamp(14px,2vw,26px)",
                background: out ? C.panel : alpha(C.panel, 40),
                borderStyle: "solid",
                borderWidth: "1px 1px 1px 4px",
                borderColor: `${out ? medal : C.lineSoft} ${out ? medal : C.lineSoft} ${out ? medal : C.lineSoft} ${out && player ? tintFor(player.tint ?? state.players.indexOf(player)) : "transparent"}`,
                opacity: out ? 1 : 0.5,
                transition: "opacity .4s var(--snap), background .4s var(--snap), border-color .4s var(--snap)",
              }}
            >
              <div
                className="display num"
                style={{
                  fontSize: "clamp(16px,2.2vw,38px)",
                  color: out ? medal : C.edge,
                  width: "2.2ch",
                  textAlign: "center",
                }}
              >
                {out ? entry.rank : "?"}
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "clamp(16px,2.1vw,36px)",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: out ? C.text : C.edge,
                }}
              >
                {out ? (player?.name ?? "—") : "• • • • •"}
              </div>
              <div
                className="display num"
                style={{
                  fontSize: "clamp(14px,1.9vw,32px)",
                  color: out ? (entry.score < 0 ? C.warn : C.text) : C.edge,
                }}
              >
                {out ? money(entry.score) : "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div
        key={results.revealed}
        className="anim-rise"
        style={{
          flex: "none",
          fontSize: "clamp(14px,1.3vw,22px)",
          fontWeight: 600,
          color: allOut ? C.accent : C.faint,
          textAlign: "center",
        }}
      >
        {allOut
          ? `${winner?.name ?? "—"} takes it with ${money(ranked[0]?.score ?? 0)}`
          : `${results.order.length - results.revealed} to go`}
      </div>
    </main>
  );
}
