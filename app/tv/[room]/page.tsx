"use client";

import { useParams } from "next/navigation";
import { C, mono, money, tintFor } from "../../../lib/theme";
import { Score } from "../../../components/Score";
import { mediaUrl } from "../../../lib/media";
import { useSound } from "../../../lib/sound";
import { useCountdown } from "../../../lib/useCountdown";
import { useRole } from "../../../lib/useRoom";
import { clueKey, type RoomState } from "../../../shared/protocol";

export default function TvBoard() {
  const room = String(useParams().room ?? "").toUpperCase();
  const { state, connected } = useRole(room, "tv");

  // The TV is the room's speaker — phones stay quiet apart from their own buzz.
  const sound = useSound(true);
  // An untimed clue is fed a null start, so the countdown never runs at all.
  const timed = state?.timed !== false;
  const timer = useCountdown(timed ? (state?.openedAt ?? null) : null, state?.timerSeconds ?? 20);

  const clueLive = !!state?.open && state.phase === "buzz";
  const wagering = state?.phase === "wager";
  const anyBuzz = (state?.buzzes.length ?? 0) > 0;
  const finalClueUp = state?.final?.phase === "clue";

  sound.useCueOn(clueLive, "clueOpen");
  sound.useCueOn(wagering, "dailyDouble");
  sound.useCueOn(anyBuzz, "buzz");
  sound.useCueOn(!!state?.revealed, "reveal");
  sound.useCueOn(finalClueUp, "finalThink");
  // Only when a clue is genuinely live and nobody got in.
  sound.useCueOn(timed && clueLive && timer.expired && !anyBuzz, "timeUp");

  if (!state?.game) {
    return (
      <Waiting room={room} connected={connected} hasState={!!state} />
    );
  }

  const { game, players, used, open, buzzes, revealed, openedAt, timerSeconds, phase, dd, final } = state;

  if (final) {
    return <FinalBoard state={state} />;
  }

  const openClue = open ? game.categories[open.c]?.clues[open.r] : null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const ddOwner = dd ? (byId.get(dd.playerId) ?? null) : null;

  return (
    <main
      style={{
        position: "relative",
        height: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: "clamp(16px,2vw,32px) clamp(20px,2.5vw,40px)",
        gap: "clamp(14px,1.6vw,22px)",
        background: "radial-gradient(120% 90% at 50% -20%, #17203a 0%, #0a0d16 55%, #06080e 100%)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 24, flex: "none" }}>
        <div
          style={{
            width: 52,
            height: 52,
            border: `2px solid ${C.gold}`,
            transform: "rotate(45deg)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div style={{ width: 18, height: 18, background: C.gold }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontFamily: mono, fontSize: "clamp(10px,.85vw,14px)", letterSpacing: ".32em", color: C.dim }}>
            {game.subtitle || "ROUND 01"}
          </div>
          <div style={{ fontSize: "clamp(24px,2.4vw,40px)", fontWeight: 700, letterSpacing: ".05em", lineHeight: 1 }}>
            {game.title}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Badge>
          <span style={{ color: C.cyan }}>●</span> {players.filter((p) => p.connected).length} CONNECTED
        </Badge>
        <Badge>
          ROOM <span style={{ color: C.gold }}>{room}</span>
        </Badge>
        <button
          onClick={() => sound.setMuted(!sound.muted)}
          title={sound.muted ? "Sound off" : "Sound on"}
          style={{
            padding: "10px 14px",
            background: "#0e1420",
            border: `1px solid ${C.line}`,
            fontFamily: mono,
            fontSize: 13,
            color: sound.muted ? C.faint : C.cyan,
          }}
        >
          {sound.muted ? "🔇" : "🔊"}
        </button>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${game.categories.length}, 1fr)`,
          gap: 8,
        }}
      >
        {game.categories.map((cat, ci) => (
          <div
            key={ci}
            style={{
              display: "grid",
              gridTemplateRows: `clamp(52px,6vh,86px) repeat(${game.values.length}, 1fr)`,
              gap: 8,
              minHeight: 0,
            }}
          >
            <div
              style={{
                background: "linear-gradient(180deg,#131a28,#0c111b)",
                border: `1px solid #2a3244`,
                borderTop: `2px solid ${C.gold}`,
                display: "grid",
                placeItems: "center",
                padding: "0 10px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "clamp(11px,1vw,21px)", fontWeight: 600, letterSpacing: ".1em", lineHeight: 1.15 }}>
                {cat.name || "—"}
              </div>
            </div>
            {game.values.map((value, ri) => {
              const spent = used.includes(clueKey(ci, ri));
              return (
                <div
                  key={ri}
                  style={{
                    display: "grid",
                    placeItems: "center",
                    background: spent ? "#0a0e16" : "linear-gradient(180deg,#1b2434,#10161f)",
                    border: `1px solid ${spent ? "#1a2130" : "#2f3a4f"}`,
                    clipPath: "polygon(0 0,100% 0,100% 76%,90% 100%,0 100%)",
                  }}
                >
                  {spent ? (
                    <div
                      className="anim-pop"
                      style={{ width: 22, height: 22, border: `1px solid ${C.line}`, transform: "rotate(45deg)" }}
                    />
                  ) : (
                    <div
                      style={{
                        fontSize: "clamp(20px,3vw,60px)",
                        fontWeight: 700,
                        color: C.gold,
                        textShadow: "0 0 26px rgba(240,196,105,.28)",
                      }}
                    >
                      {value}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div
        style={{
          flex: "none",
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(players.length, 1)}, 1fr)`,
          gap: 10,
          height: "clamp(72px,11vh,128px)",
        }}
      >
        {players.length === 0 && (
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".2em", color: C.faint, alignSelf: "center" }}>
            NOBODY HAS JOINED YET — PLAYERS GO TO /play/{room}
          </div>
        )}
        {players.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "0 18px",
              background: "linear-gradient(100deg,#111825,#0b0f18)",
              border: `1px solid ${C.line}`,
              borderLeft: `4px solid ${tintFor(i)}`,
              opacity: p.connected ? 1 : 0.45,
              clipPath: "polygon(0 0,100% 0,100% 74%,97% 100%,0 100%)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "clamp(13px,1.2vw,23px)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {p.name}
              </div>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: "#7d879c" }}>
                {p.cls || (p.connected ? "GUARDIAN" : "AWAY")}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <Score
              value={p.score}
              style={{ fontFamily: mono, fontSize: "clamp(16px,1.9vw,38px)", fontWeight: 600 }}
            />
          </div>
        ))}
      </div>

      {/* While a wager is being chosen the clue must not appear anywhere the
          wagering player can see it — so the TV shows only the stakes. */}
      {open && phase === "wager" && dd && (
        <div
          className="anim-dd"
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(110% 70% at 50% 20%, #2a1d47, #08070f 72%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 30,
          }}
        >
          <div style={{ fontFamily: mono, fontSize: "clamp(12px,1.2vw,18px)", letterSpacing: ".4em", color: C.violet }}>
            {game.categories[open.c]?.name}
          </div>
          <div
            style={{
              fontSize: "clamp(46px,7vw,120px)",
              fontWeight: 700,
              letterSpacing: ".06em",
              lineHeight: 1,
              color: C.text,
              textShadow: "0 0 60px rgba(177,140,240,.45)",
            }}
          >
            DAILY DOUBLE
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 40, height: 40, border: `2px solid ${C.violet}`, transform: "rotate(45deg)" }} />
            <div style={{ fontSize: "clamp(24px,3vw,52px)", fontWeight: 600, letterSpacing: ".04em" }}>
              {ddOwner?.name ?? "—"}
            </div>
          </div>
          <div
            style={{
              fontFamily: mono,
              fontSize: "clamp(11px,1vw,16px)",
              letterSpacing: ".3em",
              color: C.dim,
              textAlign: "center",
              lineHeight: 2.2,
            }}
          >
            IS CHOOSING A WAGER
            <br />
            <span style={{ color: C.faint }}>
              {money(dd.min)} — {money(dd.max)}
            </span>
          </div>
        </div>
      )}

      {open && openClue && phase !== "wager" && (
        <div
          key={`${open.c}-${open.r}`}
          className="anim-clue"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(160deg,#0d1526 0%,#080b12 60%,#0b0910 100%)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ flex: "none", height: 4, background: "#1a2130" }}>
            {timed && (
              <div
                key={openedAt ?? 0}
                style={{
                  height: "100%",
                  background: `linear-gradient(90deg,${C.gold},${C.orange})`,
                  animation: `drain ${timerSeconds}s linear forwards`,
                }}
              />
            )}
          </div>

          <div
            style={{
              flex: "none",
              display: "flex",
              alignItems: "center",
              gap: 18,
              padding: "22px 40px",
              borderBottom: `1px solid #1c2434`,
            }}
          >
            <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: ".3em", color: C.gold }}>
              {game.categories[open.c]?.name}
            </div>
            <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: ".3em", color: dd ? C.violet : "#9fb0c8" }}>
              {dd ? `WAGER ${money(dd.wager ?? 0)}` : game.values[open.r]}
            </div>
            <div style={{ flex: 1 }} />
            <div
              // Pulses through the last five seconds, so the room feels the
              // clock running out without staring at the number.
              className={timed && !timer.expired && timer.remaining <= 5 ? "anim-urgent" : undefined}
              style={{
                fontFamily: mono,
                fontSize: 28,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                transition: "color .2s var(--snap)",
                color: !timed ? "#3d4a63" : timer.expired ? C.orange : timer.remaining <= 5 ? C.gold : "#6d7791",
              }}
            >
              {!timed ? "∞" : timer.expired ? "TIME" : `${timer.remaining}s`}
            </div>
            {openClue.dd && (
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  letterSpacing: ".26em",
                  color: "#0a0d14",
                  background: C.orange,
                  padding: "5px 12px",
                }}
              >
                DAILY DOUBLE
              </div>
            )}
          </div>

          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 400px", minHeight: 0 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 36,
                padding: "0 clamp(32px,5vw,90px)",
              }}
            >
              {openClue.media && openClue.mediaKey && (
                <div
                  style={{
                    height: "clamp(160px,34vh,420px)",
                    display: "grid",
                    placeItems: "center",
                    background: "#05070c",
                    border: `1px solid #2a3244`,
                    overflow: "hidden",
                  }}
                >
                  {openClue.media === "video" ? (
                    <video
                      // Re-keyed per clue so opening a new one starts its own clip
                      // rather than leaving the previous video mounted.
                      key={openClue.mediaKey}
                      src={mediaUrl(openClue.mediaKey)}
                      autoPlay
                      controls
                      playsInline
                      style={{ maxWidth: "100%", maxHeight: "100%" }}
                    />
                  ) : (
                    <img
                      key={openClue.mediaKey}
                      src={mediaUrl(openClue.mediaKey)}
                      alt={openClue.mediaLabel || ""}
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    />
                  )}
                </div>
              )}

              {openClue.media && !openClue.mediaKey && (
                <div
                  style={{
                    height: "clamp(140px,26vh,330px)",
                    display: "grid",
                    placeItems: "center",
                    border: `1px solid #2a3244`,
                    background:
                      "repeating-linear-gradient(135deg,#141b28 0px,#141b28 10px,#101620 10px,#101620 20px)",
                    fontFamily: mono,
                    fontSize: 14,
                    letterSpacing: ".26em",
                    color: "#6d7791",
                  }}
                >
                  {openClue.mediaLabel || `[ ${openClue.media.toUpperCase()} ]`}
                </div>
              )}
              <div style={{ fontSize: "clamp(26px,3.6vw,66px)", fontWeight: 500, lineHeight: 1.24 }}>
                {openClue.t || "—"}
              </div>
              {revealed && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    borderTop: `1px solid #2a3244`,
                    paddingTop: 24,
                  }}
                >
                  <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: ".28em", color: C.dim }}>
                    CORRECT RESPONSE
                  </div>
                  <div style={{ fontSize: "clamp(20px,2.3vw,42px)", fontWeight: 700, color: C.gold }}>
                    {openClue.a || "—"}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                borderLeft: `1px solid #1c2434`,
                background: "rgba(6,9,16,.6)",
                display: "flex",
                flexDirection: "column",
                padding: 32,
                gap: 10,
              }}
            >
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".3em", color: "#7d879c", marginBottom: 12 }}>
                {dd ? "ANSWERING" : "BUZZ ORDER"}
              </div>

              {dd && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "18px 20px",
                    background: "rgba(177,140,240,.12)",
                    border: `1px solid ${C.violet}`,
                    clipPath: "polygon(0 0,100% 0,100% 70%,95% 100%,0 100%)",
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 600 }}>{ddOwner?.name ?? "—"}</div>
                  <div style={{ fontFamily: mono, fontSize: 14, letterSpacing: ".2em", color: C.violet }}>
                    RISKING {money(dd.wager ?? 0)}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: C.faint, lineHeight: 1.9 }}>
                    NOBODY ELSE MAY ANSWER
                  </div>
                </div>
              )}

              {!dd && buzzes.length === 0 && (
                <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".2em", color: C.faint, lineHeight: 2 }}>
                  NOBODY IN YET
                </div>
              )}
              {!dd && buzzes.map((b, i) => (
                <div
                  key={b.playerId}
                  className="anim-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "14px 18px",
                    background: i === 0 ? "rgba(240,196,105,.12)" : "rgba(255,255,255,.025)",
                    border: `1px solid ${i === 0 ? C.goldDeep : C.line}`,
                    clipPath: "polygon(0 0,100% 0,100% 70%,95% 100%,0 100%)",
                    // Each entry lands after the one above it.
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 22,
                      fontWeight: 600,
                      color: i === 0 ? C.gold : C.dimmer,
                      width: 28,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 600, flex: 1 }}>
                    {byId.get(b.playerId)?.name ?? "—"}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 14, color: "#7d879c" }}>
                    {(b.ms / 1000).toFixed(2)}s
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * The final round on the big screen.
 *
 * Wagers and written responses stay hidden until the host starts revealing, and
 * then only for players already stepped through — the whole point is that the
 * room finds out one at a time.
 */
function FinalBoard({ state }: { state: RoomState }) {
  const final = state.final!;
  const clue = state.game?.final;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const revealedSoFar = final.phase === "done" ? final.order.length : final.revealIndex;

  return (
    <main
      style={{
        height: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "clamp(18px,3vh,36px)",
        padding: "clamp(20px,4vh,56px)",
        background: "radial-gradient(110% 70% at 50% 15%, #241a44, #07060d 74%)",
      }}
    >
      <div style={{ fontFamily: mono, fontSize: "clamp(11px,1.1vw,17px)", letterSpacing: ".42em", color: C.violet }}>
        FINAL ROUND
      </div>

      <div
        style={{
          fontSize: "clamp(30px,4.6vw,78px)",
          fontWeight: 700,
          letterSpacing: ".04em",
          textAlign: "center",
          lineHeight: 1.1,
          textShadow: "0 0 60px rgba(177,140,240,.4)",
        }}
      >
        {clue?.category || "FINAL"}
      </div>

      {final.phase === "wager" && (
        <div style={{ fontFamily: mono, fontSize: "clamp(11px,1vw,16px)", letterSpacing: ".28em", color: C.dim, lineHeight: 2.2, textAlign: "center" }}>
          EVERYONE IS WAGERING
          <br />
          <span style={{ color: C.faint }}>
            {final.order.filter((id) => final.entries[id].wager !== null).length} OF {final.order.length} LOCKED IN
          </span>
        </div>
      )}

      {final.phase !== "wager" && clue?.mediaKey && (
        <div
          style={{
            height: "clamp(140px,28vh,340px)",
            display: "grid",
            placeItems: "center",
            background: "#05070c",
            border: `1px solid #2a3244`,
            overflow: "hidden",
            width: "min(900px, 92%)",
          }}
        >
          {clue.media === "video" ? (
            <video key={clue.mediaKey} src={mediaUrl(clue.mediaKey)} autoPlay controls playsInline style={{ maxWidth: "100%", maxHeight: "100%" }} />
          ) : (
            <img key={clue.mediaKey} src={mediaUrl(clue.mediaKey)} alt={clue.mediaLabel || ""} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          )}
        </div>
      )}

      {final.phase !== "wager" && (
        <div
          style={{
            fontSize: "clamp(22px,3vw,54px)",
            fontWeight: 500,
            lineHeight: 1.3,
            textAlign: "center",
            maxWidth: "22ch",
          }}
        >
          {clue?.t}
        </div>
      )}

      {(final.phase === "reveal" || final.phase === "done") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "min(920px, 92%)" }}>
          {final.order.map((id, i) => {
            const player = byId.get(id);
            const entry = final.entries[id];
            const shown = i < revealedSoFar || (i === final.revealIndex && entry.judged !== null);
            const active = final.phase === "reveal" && i === final.revealIndex;
            return (
              <div
                key={id}
                className={active ? "anim-row" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "14px 20px",
                  background: active ? "rgba(240,196,105,.12)" : "rgba(255,255,255,.03)",
                  border: `1px solid ${active ? C.gold : C.line}`,
                  opacity: shown || active ? 1 : 0.45,
                  transform: active ? "scale(1.015)" : "none",
                  transition: "opacity .3s var(--snap), background .3s var(--snap), border-color .3s var(--snap), transform .2s var(--snap)",
                }}
              >
                <div style={{ fontSize: "clamp(15px,1.5vw,26px)", fontWeight: 600, width: "22%", minWidth: 0 }}>
                  {player?.name ?? "—"}
                </div>
                <div style={{ flex: 1, fontSize: "clamp(14px,1.4vw,24px)", minWidth: 0 }}>
                  {shown || active ? entry.response.trim() || "— nothing —" : "…"}
                </div>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: "clamp(12px,1.1vw,20px)",
                    color: entry.judged === "correct" ? C.green : entry.judged === "wrong" ? C.orange : C.violet,
                    minWidth: 90,
                    textAlign: "right",
                  }}
                >
                  {entry.judged ? (entry.judged === "correct" ? "+" : "−") + money(entry.wager ?? 0) : shown || active ? money(entry.wager ?? 0) : "?"}
                </div>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: "clamp(13px,1.3vw,24px)",
                    fontWeight: 600,
                    color: (player?.score ?? 0) < 0 ? C.orange : C.gold,
                    minWidth: 100,
                    textAlign: "right",
                  }}
                >
                  {money(player?.score ?? 0)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {final.phase === "done" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: mono, fontSize: "clamp(10px,.9vw,14px)", letterSpacing: ".3em", color: C.dim }}>
            WINNER
          </div>
          <div
            className="anim-dd"
            style={{
              position: "relative",
              overflow: "hidden",
              fontSize: "clamp(28px,3.6vw,60px)",
              fontWeight: 700,
              color: C.gold,
              padding: "0 6px",
            }}
          >
            {state.players.slice().sort((a, b) => b.score - a.score)[0]?.name ?? "—"}
            {/* One slow pass of light across the winner's name. */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,.5) 50%, transparent 65%)",
                animation: "sheen 1.6s var(--snap) .5s",
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        background: "#0e1420",
        border: `1px solid ${C.line}`,
        fontFamily: mono,
        fontSize: 13,
        letterSpacing: ".2em",
        color: "#9fb0c8",
      }}
    >
      {children}
    </div>
  );
}

function Waiting({ room, connected, hasState }: { room: string; connected: boolean; hasState: boolean }) {
  return (
    <main
      style={{
        height: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(120% 70% at 50% 0%, #17203a, #05070c 70%)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div style={{ width: 60, height: 60, border: `2px solid #2f3a4f`, transform: "rotate(45deg)" }} />
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: ".05em", color: C.dim }}>
          {!connected ? "CONNECTING…" : hasState ? "WAITING FOR THE HOST TO LOAD A GAME" : "JOINING ROOM…"}
        </div>
        <div style={{ fontFamily: mono, fontSize: 34, fontWeight: 600, letterSpacing: ".22em", color: C.gold }}>
          {room}
        </div>
      </div>
    </main>
  );
}
