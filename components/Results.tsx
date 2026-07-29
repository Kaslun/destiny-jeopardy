"use client";

import { C, mono, money, tintFor } from "../lib/theme";
import { standings, type RoomState } from "../shared/protocol";

const MEDAL = ["#f0c469", "#c9d2e2", "#c98a4b"];

/**
 * The closing standings, revealed one place at a time.
 *
 * Places are read out worst-first, so the board fills from the bottom and the
 * top slot stays conspicuously empty until the end. Everyone can see exactly
 * how much is still unclaimed, which is where the tension comes from — a
 * scoreboard that simply appeared would carry none of it.
 */
export function Results({ state }: { state: RoomState }) {
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
        background: winnerOut
          ? "radial-gradient(120% 80% at 50% 8%, #3a2c08 0%, #0d0a06 58%, #06070c 100%)"
          : "radial-gradient(120% 90% at 50% -10%, #17203a 0%, #0a0d16 55%, #06080e 100%)",
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
            background:
              "repeating-conic-gradient(from 0deg at 50% 50%, rgba(240,196,105,.16) 0deg 7deg, transparent 7deg 20deg)",
          }}
        />
      )}

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "none" }}>
        <div style={{ fontFamily: mono, fontSize: "clamp(10px,1vw,15px)", letterSpacing: ".42em", color: C.dim }}>
          {allOut ? "THAT'S THE GAME" : "FINAL STANDINGS"}
        </div>
        <div
          style={{
            fontSize: "clamp(24px,3.4vw,58px)",
            fontWeight: 700,
            letterSpacing: ".05em",
            lineHeight: 1,
            color: allOut ? C.gold : C.text,
            transition: "color .8s var(--snap)",
          }}
        >
          {state.game?.title ?? "GUARDIAN JEOPARDY"}
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
                  background: "linear-gradient(100deg, rgba(240,196,105,.22), rgba(240,196,105,.06))",
                  border: `2px solid ${C.gold}`,
                  boxShadow: "0 0 70px rgba(240,196,105,.35)",
                }}
              >
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: "clamp(26px,4vw,72px)",
                    fontWeight: 600,
                    color: C.gold,
                    width: "2.2ch",
                    textAlign: "center",
                  }}
                >
                  1
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "clamp(26px,4.4vw,80px)",
                      fontWeight: 700,
                      letterSpacing: ".02em",
                      lineHeight: 1.05,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {player?.name ?? "—"}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: "clamp(10px,1vw,16px)", letterSpacing: ".3em", color: C.gold }}>
                    WINNER
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: "clamp(22px,3.2vw,58px)",
                    fontWeight: 600,
                    color: C.gold,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
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
              className={out ? "anim-slam" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "clamp(12px,1.8vw,26px)",
                padding: "clamp(9px,1.5vh,18px) clamp(14px,2vw,26px)",
                background: out ? "rgba(255,255,255,.045)" : "rgba(255,255,255,.015)",
                border: `1px solid ${out ? medal : C.lineSoft}`,
                borderLeft: `4px solid ${out && player ? tintFor(state.players.findIndex((p) => p.id === entry.id)) : "transparent"}`,
                opacity: out ? 1 : 0.5,
                transition: "opacity .4s var(--snap), background .4s var(--snap), border-color .4s var(--snap)",
              }}
            >
              <div
                style={{
                  fontFamily: mono,
                  fontSize: "clamp(16px,2.2vw,38px)",
                  fontWeight: 600,
                  color: out ? medal : "#2f3a4f",
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
                  fontWeight: 600,
                  letterSpacing: ".03em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: out ? C.text : "#2f3a4f",
                }}
              >
                {out ? (player?.name ?? "—") : "• • • • •"}
              </div>
              <div
                style={{
                  fontFamily: mono,
                  fontSize: "clamp(14px,1.9vw,32px)",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: out ? (entry.score < 0 ? C.orange : C.text) : "#2f3a4f",
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
          fontFamily: mono,
          fontSize: "clamp(10px,1vw,15px)",
          letterSpacing: ".3em",
          color: allOut ? C.gold : C.faint,
          textAlign: "center",
        }}
      >
        {allOut
          ? `${winner?.name ?? "—"} TAKES IT WITH ${money(ranked[0]?.score ?? 0)}`
          : `${results.order.length - results.revealed} PLACE${results.order.length - results.revealed === 1 ? "" : "S"} STILL TO COME`}
      </div>
    </main>
  );
}
