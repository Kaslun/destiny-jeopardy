"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { alpha, C, mono, money, SCENE, tintFor } from "../../../lib/theme";
import { Score } from "../../../components/Score";
import { ClueMedia } from "../../../components/ClueMedia";
import { Lobby } from "../../../components/Lobby";
import { Results } from "../../../components/Results";
import { SoundGate } from "../../../components/SoundGate";
import { useSound } from "../../../lib/sound";
import { useCountdown } from "../../../lib/useCountdown";
import { useRole } from "../../../lib/useRoom";
import { useTheme } from "../../../lib/useTheme";
import { clueKey, roundOf, type RoomState } from "../../../shared/protocol";
import type { Theme } from "../../../lib/themes";

export default function TvBoard() {
  const room = String(useParams().room ?? "").toUpperCase();
  const { state, connected } = useRole(room, "tv");

  // The board decides how the room looks. Applied as a side effect, so every
  // one of this component's several return paths is covered by one call.
  const theme = useTheme(state?.game?.theme);

  // The TV is the room's speaker — phones stay quiet apart from their own buzz.
  const sound = useSound(true);
  // Driven from `shownAt`, always: the read delay and the clue's own clock are
  // two stretches of one countdown. An untimed clue still has a read delay —
  // the buzzers open on the same schedule either way — so it is only `expired`
  // that stops meaning anything, not the whole clock.
  const timed = state?.timed !== false;
  const timer = useCountdown(state?.shownAt ?? null, state?.timerSeconds ?? 20, state?.readSeconds ?? 0);
  const reading = timer.waiting;
  const timeUp = timed && timer.expired;

  const clueLive = !!state?.open && state.phase === "buzz";
  const wagering = state?.phase === "wager";
  const anyBuzz = (state?.buzzes.length ?? 0) > 0;
  const finalClueUp = state?.final?.phase === "clue";

  sound.useCueOn(clueLive, "clueOpen");
  // The moment the room is allowed in. Worth its own cue: during a read delay
  // everyone is watching the clue rather than the clock, and a sound is what
  // actually starts the race.
  sound.useCueOn(clueLive && !reading && (state?.readSeconds ?? 0) > 0, "buzzersOpen");
  sound.useCueOn(wagering, "dailyDouble");
  sound.useCueOn(anyBuzz, "buzz");
  sound.useCueOn(!!state?.revealed, "reveal");
  sound.useCueOn(finalClueUp, "finalThink");

  // The think music stops when the writing does — whether that is the clock
  // running out, everyone finishing early, or the round moving on. Leaving a
  // 30-second bed playing over the reveal is what makes it feel amateur.
  const writingOver = !finalClueUp || state?.final?.writingClosed === true;
  useEffect(() => {
    if (writingOver) sound.stop("finalThink", 1.4);
  }, [writingOver, sound]);
  // Only when a clue is genuinely live and nobody got in.
  sound.useCueOn(timeUp && clueLive && !anyBuzz, "timeUp");

  /**
   * The bed under an open board.
   *
   * Runs only while the board is on screen with nothing happening — the gap
   * between clues, which is where a silent room feels flat. It gets out of the
   * way the moment a clue opens, because a clue is being read aloud over it and
   * anything underneath is competing with the host's voice.
   *
   * Re-armed on a timer rather than looped: the synth bed is a finite burst,
   * and a `loop` on a source node cannot be faded out cleanly mid-phrase.
   */
  const boardIdle = !!state?.started && !state.open && !state.final && !state.results && !!state.game;
  useEffect(() => {
    if (!boardIdle) {
      sound.stop("boardBed", 0.9);
      return;
    }
    sound.play("boardBed");
    const id = setInterval(() => sound.play("boardBed"), 16000);
    return () => {
      clearInterval(id);
      sound.stop("boardBed", 0.9);
    };
  }, [boardIdle, sound]);

  // Every ruling gets a verdict sound — right or wrong, board clue, Daily
  // Double or final round. Keyed on the sequence number so two wrong answers in
  // a row are two distinct sounds rather than one.
  const ruling = state?.lastRuling ?? null;
  const lastRulingSeq = useRef(ruling?.seq ?? 0);
  useEffect(() => {
    if (!ruling) return;
    if (ruling.seq > lastRulingSeq.current) sound.play(ruling.correct ? "correct" : "wrong");
    lastRulingSeq.current = ruling.seq;
  }, [ruling, sound]);

  // A blip as each person arrives, so the room knows the lobby is live.
  const playerCount = state?.players.length ?? 0;
  const lastCount = useRef(playerCount);
  useEffect(() => {
    if (playerCount > lastCount.current) sound.play("join");
    lastCount.current = playerCount;
  }, [playerCount, sound]);

  // Standings: a roll under the empty board, a hit per place, a fanfare at the top.
  const results = state?.results ?? null;
  const placesOut = results?.revealed ?? 0;
  const totalPlaces = results?.order.length ?? 0;
  sound.useCueOn(!!results, "drumroll");
  const lastPlacesOut = useRef(placesOut);
  useEffect(() => {
    if (!results) {
      lastPlacesOut.current = 0;
      return;
    }
    if (placesOut > lastPlacesOut.current) {
      sound.play(placesOut >= totalPlaces ? "fanfare" : "placeReveal");
    }
    lastPlacesOut.current = placesOut;
  }, [placesOut, totalPlaces, results, sound]);

  // Shown on every TV view until audio is genuinely running. The lobby matters
  // most: that is where the TV sits, untouched, before anyone plays.
  const gate = !sound.muted && !sound.ready ? (
    <SoundGate onEnable={sound.enable} onMute={() => sound.setMuted(true)} />
  ) : null;

  if (state?.results) {
    return (
      <>
        <Results state={state} theme={theme} />
        {gate}
      </>
    );
  }

  // The lobby stands in for the board until the host starts, and it also covers
  // "no board loaded yet" — both are the same thing from the room's point of
  // view: we are waiting, here is how to join.
  if (state && !state.started) {
    return (
      <>
        <Lobby state={state} room={room} theme={theme} />
        {gate}
      </>
    );
  }

  if (!state?.game) {
    return (
      <>
        <Waiting room={room} connected={connected} hasState={!!state} />
        {gate}
      </>
    );
  }

  const { game, players, used, open, buzzes, revealed, resolved, openedAt, shownAt, readSeconds, timerSeconds, phase, dd, control, final } =
    state;

  // Everything on this screen is about one round at a time.
  const board = roundOf(game, state.round);
  if (!board) return <Waiting room={room} connected={connected} hasState />;

  if (final) {
    return <FinalBoard state={state} />;
  }

  const openClue = open ? board.categories[open.c]?.clues[open.r] : null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const ddOwner = dd ? (byId.get(dd.playerId) ?? null) : null;
  const controlName = control ? (byId.get(control)?.name ?? null) : null;

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
        background: SCENE.board,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 24, flex: "none" }}>
        <div
          style={{
            width: 52,
            height: 52,
            border: `2px solid ${C.accent}`,
            transform: "rotate(45deg)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div style={{ width: 18, height: 18, background: C.accent }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* The round's own name, not the game's subtitle — this line is how
              the room knows the money just doubled. */}
          <div
            style={{
              fontFamily: mono,
              fontSize: "clamp(10px,.85vw,14px)",
              letterSpacing: ".32em",
              color: C.dim,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span>{board.name || game.subtitle || "ROUND 01"}</span>
            {game.rounds.length > 1 && (
              <span style={{ color: C.accent }}>
                {state.round + 1}/{game.rounds.length}
              </span>
            )}
          </div>
          <div style={{ fontSize: "clamp(24px,2.4vw,40px)", fontWeight: 700, letterSpacing: ".05em", lineHeight: 1 }}>
            {game.title}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Whose turn it is, on the screen the whole room is already looking
            at. Board control has always been tracked; until now the only way
            to know who had it was to remember who answered last. */}
        {!open && controlName && (
          <div
            key={control ?? ""}
            className="anim-pop"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 20px",
              background: alpha(C.accent, 12),
              border: `1px solid ${C.accent}`,
            }}
          >
            <span style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".24em", color: C.dim }}>PICKS NEXT</span>
            <span style={{ fontSize: "clamp(15px,1.4vw,26px)", fontWeight: 700, color: C.accent }}>{controlName}</span>
          </div>
        )}
        <Badge>
          <span style={{ color: C.info }}>●</span> {players.filter((p) => p.connected).length} CONNECTED
        </Badge>
        <Badge>
          ROOM <span style={{ color: C.accent }}>{room}</span>
        </Badge>
        <button
          onClick={() => sound.setMuted(!sound.muted)}
          title={sound.muted ? "Sound off" : "Sound on"}
          style={{
            padding: "10px 14px",
            background: C.surfaceDeep,
            border: `1px solid ${C.line}`,
            fontFamily: mono,
            fontSize: 13,
            color: sound.muted ? C.faint : C.info,
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
          gridTemplateColumns: `repeat(${board.categories.length}, 1fr)`,
          gap: 8,
        }}
      >
        {board.categories.map((cat, ci) => (
          <div
            key={ci}
            style={{
              display: "grid",
              gridTemplateRows: `clamp(52px,6vh,86px) repeat(${board.values.length}, 1fr)`,
              gap: 8,
              minHeight: 0,
            }}
          >
            <div
              style={{
                background: `linear-gradient(180deg,${C.surface},${C.panel})`,
                border: `1px solid ${C.edgeSoft}`,
                borderTop: `2px solid ${C.accent}`,
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
            {board.values.map((value, ri) => {
              const spent = used.includes(clueKey(state.round, ci, ri));
              return (
                <div
                  key={ri}
                  style={{
                    display: "grid",
                    placeItems: "center",
                    background: spent ? C.panelDeep : `linear-gradient(180deg,${C.surface},${C.tile})`,
                    border: `1px solid ${spent ? C.lineSoft : C.edge}`,
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
                        color: C.accent,
                        textShadow: `0 0 26px ${alpha(C.accent, 28)}`,
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
              background: `linear-gradient(100deg,${C.panel},${C.panelDeep})`,
              border: `1px solid ${C.line}`,
              borderLeft: `4px solid ${tintFor(p.tint ?? i)}`,
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
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: C.muted }}>
                {p.cls || (p.connected ? theme.copy.classFallback : "AWAY")}
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
            background: SCENE.dailyDouble,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 30,
          }}
        >
          <div style={{ fontFamily: mono, fontSize: "clamp(12px,1.2vw,18px)", letterSpacing: ".4em", color: C.special }}>
            {board.categories[open.c]?.name}
          </div>
          <div
            style={{
              fontSize: "clamp(46px,7vw,120px)",
              fontWeight: 700,
              letterSpacing: ".06em",
              lineHeight: 1,
              color: C.text,
              textShadow: `0 0 60px ${alpha(C.special, 45)}`,
            }}
          >
            DAILY DOUBLE
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 40, height: 40, border: `2px solid ${C.special}`, transform: "rotate(45deg)" }} />
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
            background: SCENE.clue,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* One bar, two jobs. While the clue is being read it drains in the
              "not yet" colour; when the buzzers open it restarts as the clue's
              own clock. Keyed so each phase animates from full. */}
          <div style={{ flex: "none", height: 4, background: C.lineSoft }}>
            {reading ? (
              <div
                key={`read-${shownAt ?? 0}`}
                style={{
                  height: "100%",
                  background: `linear-gradient(90deg,${C.info},${C.special})`,
                  animation: `drain ${readSeconds}s linear forwards`,
                }}
              />
            ) : (
              timed &&
              !resolved && (
                <div
                  key={`live-${openedAt ?? 0}`}
                  style={{
                    height: "100%",
                    background: `linear-gradient(90deg,${C.accent},${C.warn})`,
                    animation: `drain ${timerSeconds}s linear forwards`,
                  }}
                />
              )
            )}
          </div>

          <div
            style={{
              flex: "none",
              display: "flex",
              alignItems: "center",
              gap: 18,
              padding: "22px 40px",
              borderBottom: `1px solid ${C.lineSoft}`,
            }}
          >
            <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: ".3em", color: C.accent }}>
              {board.categories[open.c]?.name}
            </div>
            <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: ".3em", color: dd ? C.special : C.dim }}>
              {dd ? `WAGER ${money(dd.wager ?? 0)}` : board.values[open.r]}
            </div>
            <div style={{ flex: 1 }} />
            <div
              // Pulses through the last five seconds, so the room feels the
              // clock running out without staring at the number.
              className={
                !reading && !resolved && timed && !timeUp && timer.remaining <= 5 ? "anim-urgent" : undefined
              }
              style={{
                fontFamily: mono,
                fontSize: 28,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                transition: "color .2s var(--snap)",
                color: reading
                  ? C.info
                  : resolved
                    ? C.good
                    : !timed
                      ? C.dimmer
                      : timeUp
                        ? C.warn
                        : timer.remaining <= 5
                          ? C.accent
                          : C.mutedDeep,
              }}
            >
              {reading
                ? `BUZZ IN ${timer.waitRemaining}s`
                : resolved
                  ? "ANSWERED"
                  : !timed
                    ? "∞"
                    : timeUp
                      ? "TIME"
                      : `${timer.remaining}s`}
            </div>
            {openClue.dd && (
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  letterSpacing: ".26em",
                  color: C.onAccent,
                  background: C.warn,
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
                <ClueMedia
                  media={openClue.media}
                  mediaKey={openClue.mediaKey}
                  label={openClue.mediaLabel}
                  height="clamp(160px,34vh,420px)"
                  autoPlay
                />
              )}

              {openClue.media && !openClue.mediaKey && (
                <div
                  style={{
                    height: "clamp(140px,26vh,330px)",
                    display: "grid",
                    placeItems: "center",
                    border: `1px solid ${C.edgeSoft}`,
                    background:
                      `repeating-linear-gradient(135deg,${C.surface} 0px,${C.surface} 10px,${C.tile} 10px,${C.tile} 20px)`,
                    fontFamily: mono,
                    fontSize: 14,
                    letterSpacing: ".26em",
                    color: C.mutedDeep,
                  }}
                >
                  {openClue.mediaLabel || `[ ${openClue.media.toUpperCase()} ]`}
                </div>
              )}
              {/* Media-only clues are a real thing — "what is this?" over a
                  photograph. Rendering an em dash under the picture just looks
                  like the text failed to load. */}
              {openClue.t.trim() && (
                <div style={{ fontSize: "clamp(26px,3.6vw,66px)", fontWeight: 500, lineHeight: 1.24 }}>
                  {openClue.t}
                </div>
              )}
              {revealed && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    borderTop: `1px solid ${C.edgeSoft}`,
                    paddingTop: 24,
                  }}
                >
                  <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: ".28em", color: C.dim }}>
                    CORRECT RESPONSE
                  </div>
                  <div style={{ fontSize: "clamp(20px,2.3vw,42px)", fontWeight: 700, color: C.accent }}>
                    {openClue.a || "—"}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                borderLeft: `1px solid ${C.lineSoft}`,
                background: alpha(C.bg, 60),
                display: "flex",
                flexDirection: "column",
                padding: 32,
                gap: 10,
              }}
            >
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 12,
                  letterSpacing: ".3em",
                  color: reading ? C.info : C.muted,
                  marginBottom: 12,
                }}
              >
                {dd ? "ANSWERING" : reading ? "LISTEN…" : "BUZZ ORDER"}
              </div>

              {/* The whole point of the delay is that the room can see it is
                  coming. A dead buzzer with no explanation reads as broken. */}
              {!dd && reading && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    padding: "26px 18px",
                    border: `1px solid ${C.info}`,
                    background: alpha(C.info, 8),
                  }}
                >
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 56,
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: C.info,
                    }}
                  >
                    {timer.waitRemaining}
                  </div>
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 11,
                      letterSpacing: ".26em",
                      color: C.dim,
                      textAlign: "center",
                      lineHeight: 2,
                    }}
                  >
                    UNTIL BUZZERS OPEN
                  </div>
                </div>
              )}

              {dd && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "18px 20px",
                    background: alpha(C.special, 12),
                    border: `1px solid ${C.special}`,
                    clipPath: "polygon(0 0,100% 0,100% 70%,95% 100%,0 100%)",
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 600 }}>{ddOwner?.name ?? "—"}</div>
                  <div style={{ fontFamily: mono, fontSize: 14, letterSpacing: ".2em", color: C.special }}>
                    RISKING {money(dd.wager ?? 0)}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: C.faint, lineHeight: 1.9 }}>
                    NOBODY ELSE MAY ANSWER
                  </div>
                </div>
              )}

              {!dd && !reading && buzzes.length === 0 && (
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
                    border: `1px solid ${i === 0 ? C.accentDeep : C.line}`,
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
                      color: i === 0 ? C.accent : C.dimmer,
                      width: 28,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 600, flex: 1 }}>
                    {byId.get(b.playerId)?.name ?? "—"}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 14, color: C.muted }}>
                    {(b.ms / 1000).toFixed(2)}s
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {gate}
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
  const writing = final.phase === "clue" && !final.writingClosed;
  const timer = useCountdown(writing && state.timed ? state.openedAt : null, state.timerSeconds);
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
        background: SCENE.final,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: "clamp(11px,1.1vw,17px)", letterSpacing: ".42em", color: C.special }}>
        FINAL ROUND
      </div>

      <div
        style={{
          fontSize: "clamp(30px,4.6vw,78px)",
          fontWeight: 700,
          letterSpacing: ".04em",
          textAlign: "center",
          lineHeight: 1.1,
          textShadow: `0 0 60px ${alpha(C.special, 40)}`,
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

      {final.phase === "clue" && clue?.mediaKey && clue.media && (
        <div style={{ width: "min(900px, 92%)" }}>
          <ClueMedia
            media={clue.media}
            mediaKey={clue.mediaKey}
            label={clue.mediaLabel}
            height="clamp(140px,28vh,340px)"
            autoPlay
          />
        </div>
      )}

      {/* The clue owns the screen while people are writing. Once the reveal
          starts it gives way to the correct response — the standings need the
          room, and nobody is still reading the question. */}
      {final.phase === "clue" && (
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
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontFamily: mono, fontSize: "clamp(9px,.85vw,13px)", letterSpacing: ".3em", color: C.dim }}>
            CORRECT RESPONSE
          </span>
          <span style={{ fontSize: "clamp(20px,2.4vw,40px)", fontWeight: 700, color: C.info }}>{clue?.a}</span>
        </div>
      )}

      {final.phase === "clue" && (
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            className={writing && state.timed && !timer.expired && timer.remaining <= 5 ? "anim-urgent" : undefined}
            style={{
              fontFamily: mono,
              fontSize: "clamp(24px,3.2vw,54px)",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              color: !writing ? C.warn : timer.remaining <= 5 ? C.accent : C.special,
              transition: "color .3s var(--snap)",
            }}
          >
            {!state.timed ? "∞" : !writing ? "PENS DOWN" : `${timer.remaining}s`}
          </div>
          <div style={{ fontFamily: mono, fontSize: "clamp(10px,.9vw,14px)", letterSpacing: ".26em", color: C.faint }}>
            {final.order.filter((id) => final.entries[id].response.trim() !== "").length} OF {final.order.length} WRITTEN
          </div>
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
                  border: `1px solid ${active ? C.accent : C.line}`,
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
                    color: entry.judged === "correct" ? C.good : entry.judged === "wrong" ? C.warn : C.special,
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
                    // Masked until this place is called: an unrevealed score
                    // column lets anyone read the finishing order straight off
                    // the screen, which is the entire thing being built up to.
                    color: !(shown || active)
                      ? C.edge
                      : (player?.score ?? 0) < 0
                        ? C.warn
                        : C.accent,
                    minWidth: 100,
                    textAlign: "right",
                  }}
                >
                  {shown || active ? money(player?.score ?? 0) : "—"}
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
              color: C.accent,
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
                // `both`: hold the off-screen start during the delay and the
                // off-screen end afterwards. Without it the band parks itself
                // in the middle of the name once the sweep finishes.
                animation: "sheen 1.6s var(--snap) .5s both",
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
        background: C.surfaceDeep,
        border: `1px solid ${C.line}`,
        fontFamily: mono,
        fontSize: 13,
        letterSpacing: ".2em",
        color: C.dim,
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
        background: SCENE.landing,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div style={{ width: 60, height: 60, border: `2px solid ${C.edge}`, transform: "rotate(45deg)" }} />
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: ".05em", color: C.dim }}>
          {!connected ? "CONNECTING…" : hasState ? "WAITING FOR THE HOST TO LOAD A GAME" : "JOINING ROOM…"}
        </div>
        <div style={{ fontFamily: mono, fontSize: 34, fontWeight: 600, letterSpacing: ".22em", color: C.accent }}>
          {room}
        </div>
      </div>
    </main>
  );
}
