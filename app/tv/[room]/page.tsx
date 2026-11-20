"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { alpha, C, CELL, money, tintFor } from "../../../lib/theme";
import { Icon, Mark } from "../../../components/ui";
import { Score } from "../../../components/Score";
import { ClueMedia } from "../../../components/ClueMedia";
import { Lobby } from "../../../components/Lobby";
import { Results } from "../../../components/Results";
import { SoundGate } from "../../../components/SoundGate";
import { useSound } from "../../../lib/sound";
import { useCountdown } from "../../../lib/useCountdown";
import { useRole } from "../../../lib/useRoom";
import { useTheme } from "../../../lib/useTheme";
import { DEFAULT_THEME_ID } from "../../../lib/themes";
import { clueKey, roundOf, type RoomState } from "../../../shared/protocol";

export default function TvBoard() {
  const room = String(useParams().room ?? "").toUpperCase();
  const { state, connected } = useRole(room, "tv");

  // The board decides how the room looks. Applied as a side effect, so every
  // one of this component's several return paths is covered by one call.
  const theme = useTheme(state?.game ? state.game.theme : DEFAULT_THEME_ID, state?.game?.style);

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

  const board = roundOf(game, state.round);
  if (!board) return <Waiting room={room} connected={connected} hasState />;
  if (final) return <FinalBoard state={state} />;

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
        gap: "clamp(12px,1.6vw,22px)",
        background: "var(--scene-board)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 18, flex: "none" }}>
        <Mark mark={theme.mark} size={52} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div className="display broadcast truncate" style={{ fontSize: "clamp(24px,2.4vw,42px)" }}>
            {game.title}
          </div>
          <div style={{ fontSize: "clamp(13px,1vw,18px)", color: C.dim, display: "flex", gap: 10 }}>
            <span>{board.name || `Round ${state.round + 1}`}</span>
            {game.rounds.length > 1 && (
              <span style={{ color: C.faint }}>
                {state.round + 1} of {game.rounds.length}
              </span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {!open && controlName && (
          <div
            key={control ?? ""}
            className="anim-pop"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 22px",
              borderRadius: "var(--r-btn)",
              background: alpha(C.accent, 14),
              border: `1px solid ${alpha(C.accent, 60)}`,
            }}
          >
            <span style={{ fontSize: "clamp(13px,1vw,18px)", color: C.dim }}>Picks next</span>
            <span style={{ fontSize: "clamp(16px,1.4vw,26px)", fontWeight: 800, color: C.accent }}>{controlName}</span>
          </div>
        )}
        <div className="mono" style={{ fontSize: "clamp(14px,1.2vw,22px)", color: C.dim, letterSpacing: ".14em" }}>
          {room}
        </div>
        <button
          onClick={() => sound.setMuted(!sound.muted)}
          title={sound.muted ? "Sound off" : "Sound on"}
          className="btn btn-ghost btn-icon"
          style={{ color: sound.muted ? C.faint : C.dim }}
        >
          <Icon name={sound.muted ? "volumeOff" : "volume"} size={20} />
        </button>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${board.categories.length}, 1fr)`,
          gap: "clamp(6px,0.6vw,10px)",
          // On a monitor-wall theme this is the black bezel around the screens.
          background: C.gap,
          padding: "clamp(6px,0.6vw,10px)",
          margin: "calc(-1 * clamp(6px,0.6vw,10px))",
          borderRadius: "var(--r-lg)",
        }}
      >
        {board.categories.map((cat, ci) => (
          <div
            key={ci}
            style={{
              display: "grid",
              gridTemplateRows: `clamp(56px,9vh,104px) repeat(${board.values.length}, 1fr)`,
              gap: "clamp(6px,0.6vw,10px)",
              minHeight: 0,
            }}
          >
            <div
              className="shape"
              style={{
                background: CELL,
                border: "1px solid var(--cell-line)",
                borderTop: "var(--cat-rule)",
                display: "grid",
                placeItems: "center",
                padding: "0 10px",
                textAlign: "center",
                color: C.cellInk,
              }}
            >
              <div className="display broadcast" style={{ fontSize: "clamp(14px,1.5vw,30px)", lineHeight: 1.1, overflowWrap: "anywhere" }}>
                {cat.name || "—"}
              </div>
            </div>
            {board.values.map((value, ri) => {
              const spent = used.includes(clueKey(state.round, ci, ri));
              return (
                <div
                  key={ri}
                  className="shape"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    background: spent ? "var(--cell-spent)" : CELL,
                    border: "1px solid var(--cell-line)",
                    transition: "background .4s var(--snap)",
                  }}
                >
                  {!spent && (
                    <div
                      className="display num"
                      style={{ fontSize: "clamp(26px,3.6vw,72px)", color: C.accent, textShadow: "var(--value-shadow)" }}
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
          gridTemplateColumns: `repeat(${Math.max(players.length, 1)}, minmax(0,1fr))`,
          gap: "clamp(8px,0.8vw,12px)",
          height: "clamp(64px,10vh,112px)",
        }}
      >
        {players.length === 0 && (
          <div style={{ fontSize: 18, color: C.faint, alignSelf: "center" }}>Nobody has joined yet — scan the code in the lobby to play</div>
        )}
        {players.map((p, i) => {
          const picking = !open && p.id === control;
          return (
            <div
              key={p.id}
              className="shape"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "0 clamp(12px,1.2vw,22px)",
                background: CELL,
                color: C.cellInk,
                borderStyle: "solid",
                borderWidth: "2px 2px 2px 6px",
                borderColor: `${picking ? C.accent : "var(--cell-line)"} ${picking ? C.accent : "var(--cell-line)"} ${picking ? C.accent : "var(--cell-line)"} ${tintFor(p.tint ?? i)}`,
                opacity: p.connected ? 1 : 0.45,
              }}
            >
              <div className="name-text truncate" style={{ fontSize: "calc(clamp(16px,1.7vw,32px) * var(--name-scale))", flex: 1 }}>
                {p.name}
              </div>
              <Score
                value={p.score}
                positiveColor={C.cellInk}
                className="broadcast"
                style={{ fontFamily: "var(--font-display)", fontSize: "clamp(20px,2.2vw,44px)", fontWeight: "var(--display-weight)" }}
              />
            </div>
          );
        })}
      </div>

      {/* While a wager is being chosen the clue must not appear anywhere the
          wagering player can see it — so the TV shows only the stakes. */}
      {open && phase === "wager" && dd && (
        <div
          className="anim-dd"
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--scene-daily-double)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(18px,3vh,36px)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "clamp(16px,1.5vw,26px)", color: C.special, fontWeight: 600 }}>{board.categories[open.c]?.name}</div>
          <div
            className="display broadcast"
            style={{ fontSize: "clamp(64px,9vw,160px)", color: C.accent, filter: `drop-shadow(0 0 40px ${alpha(C.special, 55)})` }}
          >
            Daily Double
          </div>
          <div className="broadcast" style={{ fontSize: "clamp(22px,2.4vw,42px)", fontWeight: 700 }}>
            {ddOwner?.name ?? "—"} is placing a bet
          </div>
          <div className="num" style={{ fontSize: "clamp(14px,1.2vw,22px)", color: C.dim }}>
            {money(dd.min)} – {money(dd.max)}
          </div>
        </div>
      )}

      {open && openClue && phase !== "wager" && (
        <div
          key={`${open.c}-${open.r}`}
          className="anim-clue"
          style={{ position: "absolute", inset: 0, background: "var(--scene-clue)", display: "flex", flexDirection: "column" }}
        >
          {/* One bar, two jobs: drains through the read delay, then restarts
              as the clue's own clock once the buzzers open. */}
          <div style={{ flex: "none", height: 6, background: C.lineSoft }}>
            {reading ? (
              <div
                key={`read-${shownAt ?? 0}`}
                style={{ height: "100%", background: C.info, animation: `drain ${readSeconds}s linear forwards` }}
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

          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 18, padding: "clamp(16px,2vw,28px) clamp(24px,3vw,48px)" }}>
            <div className="display broadcast" style={{ fontSize: "clamp(16px,1.5vw,28px)", color: C.cellInk }}>
              {board.categories[open.c]?.name}
            </div>
            <div className="display num broadcast" style={{ fontSize: "clamp(16px,1.5vw,28px)", color: dd ? C.special : C.accent }}>
              {dd ? `Bet ${money(dd.wager ?? 0)}` : board.values[open.r]}
            </div>
            <div style={{ flex: 1 }} />
            <div
              className={`display num ${!reading && !resolved && timed && !timeUp && timer.remaining <= 5 ? "anim-urgent" : ""}`}
              style={{
                fontSize: "clamp(26px,2.6vw,48px)",
                transition: "color .2s var(--snap)",
                color: reading ? C.info : resolved ? C.good : !timed ? C.dimmer : timeUp ? C.warn : timer.remaining <= 5 ? C.accent : C.mutedDeep,
              }}
            >
              {reading ? "" : resolved ? <Icon name="check" size={40} stroke={3} /> : !timed ? "∞" : timeUp ? "Time!" : timer.remaining}
            </div>
          </div>

          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) clamp(280px,26vw,440px)", minHeight: 0 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: "clamp(20px,3vh,40px)",
                padding: "0 clamp(32px,5vw,96px) clamp(24px,4vh,56px)",
                minHeight: 0,
              }}
            >
              {openClue.media && openClue.mediaKey && (
                <ClueMedia
                  media={openClue.media}
                  mediaKey={openClue.mediaKey}
                  label={openClue.mediaLabel}
                  height="clamp(160px,38vh,460px)"
                  autoPlay
                />
              )}
              {openClue.media && !openClue.mediaKey && (
                <div
                  className="shape"
                  style={{
                    height: "clamp(140px,26vh,330px)",
                    display: "grid",
                    placeItems: "center",
                    border: `1px solid ${C.edgeSoft}`,
                    background: `repeating-linear-gradient(135deg,${C.surface} 0px,${C.surface} 10px,${C.tile} 10px,${C.tile} 20px)`,
                    fontSize: 20,
                    color: C.muted,
                  }}
                >
                  {openClue.mediaLabel || openClue.media}
                </div>
              )}
              {openClue.t.trim() && (
                <div className="clue-text" style={{ fontSize: "clamp(28px,3.6vw,68px)", color: C.cellInk, textAlign: openClue.media ? "left" : "center" }}>
                  {openClue.t}
                </div>
              )}
              {revealed && (
                <div
                  className="anim-rise"
                  style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap", borderTop: `1px solid ${C.edgeSoft}`, paddingTop: 24 }}
                >
                  <div style={{ fontSize: "clamp(14px,1.2vw,22px)", color: C.dim }}>Answer</div>
                  <div className="display broadcast" style={{ fontSize: "clamp(24px,2.6vw,48px)", color: C.accent }}>
                    {openClue.a || "—"}
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                borderLeft: `1px solid ${C.lineSoft}`,
                background: alpha(C.bg, 50),
                display: "flex",
                flexDirection: "column",
                padding: "clamp(20px,2vw,36px)",
                gap: 10,
              }}
            >
              {!dd && reading && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <div className="display num" style={{ fontSize: "clamp(64px,7vw,128px)", color: C.info, lineHeight: 1 }}>
                    {timer.waitRemaining}
                  </div>
                  <div style={{ fontSize: "clamp(14px,1.2vw,22px)", color: C.dim }}>until you can buzz</div>
                </div>
              )}

              {dd && (
                <div
                  className="shape"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "20px 22px",
                    borderRadius: "var(--r-lg)",
                    background: alpha(C.special, 12),
                    border: `1px solid ${alpha(C.special, 55)}`,
                  }}
                >
                  <div style={{ fontSize: "clamp(22px,2vw,34px)", fontWeight: 800 }}>{ddOwner?.name ?? "—"}</div>
                  <div className="num" style={{ fontSize: "clamp(14px,1.2vw,22px)", color: C.special, fontWeight: 600 }}>
                    is betting {money(dd.wager ?? 0)}
                  </div>
                </div>
              )}

              {!dd && !reading && buzzes.length === 0 && !resolved && (
                <div style={{ flex: 1, display: "grid", placeItems: "center", fontSize: "clamp(16px,1.4vw,26px)", color: C.faint, textAlign: "center" }}>
                  Buzz in on your phone!
                </div>
              )}
              {!dd &&
                buzzes.map((b, i) => (
                  <div
                    key={b.playerId}
                    className="anim-row shape"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: "clamp(12px,1.2vw,18px) clamp(14px,1.4vw,22px)",
                      borderRadius: "var(--r-md)",
                      background: i === 0 ? alpha(C.accent, 14) : C.panel,
                      border: `1px solid ${i === 0 ? alpha(C.accent, 60) : C.line}`,
                      animationDelay: `${i * 60}ms`,
                    }}
                  >
                    <div className="display num" style={{ fontSize: "clamp(18px,1.6vw,30px)", color: i === 0 ? C.accent : C.faint, width: "1.4em" }}>
                      {i + 1}
                    </div>
                    <div className="truncate" style={{ fontSize: "clamp(18px,1.6vw,30px)", fontWeight: 700, flex: 1 }}>
                      {byId.get(b.playerId)?.name ?? "—"}
                    </div>
                    <div className="num" style={{ fontSize: "clamp(12px,1vw,18px)", color: C.muted }}>
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
 * The final round on the big screen. Wagers and responses stay hidden until the
 * host starts revealing, then come out one player at a time.
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
        background: "var(--scene-final)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "clamp(16px,1.5vw,26px)", fontWeight: 600, color: C.special }}>Final round</div>
      <div className="display broadcast" style={{ fontSize: "clamp(36px,5vw,88px)", filter: `drop-shadow(0 0 40px ${alpha(C.special, 40)})` }}>
        {clue?.category || "Final"}
      </div>

      {final.phase === "wager" && (
        <div style={{ fontSize: "clamp(16px,1.5vw,26px)", color: C.dim }}>
          Place your bets ·{" "}
          <span className="num" style={{ color: C.text, fontWeight: 700 }}>
            {final.order.filter((id) => final.entries[id].wager !== null).length} of {final.order.length}
          </span>{" "}
          locked in
        </div>
      )}

      {final.phase === "clue" && clue?.mediaKey && clue.media && (
        <div style={{ width: "min(900px, 92%)" }}>
          <ClueMedia media={clue.media} mediaKey={clue.mediaKey} label={clue.mediaLabel} height="clamp(140px,28vh,340px)" autoPlay />
        </div>
      )}

      {final.phase === "clue" && (
        <div className="clue-text" style={{ fontSize: "clamp(24px,3.2vw,58px)", maxWidth: "26ch" }}>
          {clue?.t}
        </div>
      )}

      {(final.phase === "reveal" || final.phase === "done") && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: "clamp(14px,1.2vw,22px)", color: C.dim }}>Answer</span>
          <span className="display broadcast" style={{ fontSize: "clamp(22px,2.6vw,44px)", color: C.accent }}>
            {clue?.a}
          </span>
        </div>
      )}

      {final.phase === "clue" && (
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            className={`display num ${writing && state.timed && !timer.expired && timer.remaining <= 5 ? "anim-urgent" : ""}`}
            style={{
              fontSize: "clamp(28px,3.4vw,60px)",
              color: !writing ? C.warn : timer.remaining <= 5 ? C.accent : C.special,
              transition: "color .3s var(--snap)",
            }}
          >
            {!state.timed ? "∞" : !writing ? "Pens down" : timer.remaining}
          </div>
          <div className="num" style={{ fontSize: "clamp(14px,1.2vw,22px)", color: C.faint }}>
            {final.order.filter((id) => final.entries[id].locked).length} of {final.order.length} locked in
          </div>
        </div>
      )}

      {(final.phase === "reveal" || final.phase === "done") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "min(960px, 94%)", textAlign: "left" }}>
          {final.order.map((id, i) => {
            const player = byId.get(id);
            const entry = final.entries[id];
            const shown = i < revealedSoFar || (i === final.revealIndex && entry.judged !== null);
            const active = final.phase === "reveal" && i === final.revealIndex;
            const visible = shown || active;
            return (
              <div
                key={id}
                className={`shape ${active ? "anim-row" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "clamp(12px,1.4vh,18px) 22px",
                  borderRadius: "var(--r-md)",
                  background: active ? alpha(C.accent, 12) : C.panel,
                  border: `1px solid ${active ? alpha(C.accent, 60) : C.line}`,
                  opacity: visible ? 1 : 0.45,
                  transform: active ? "scale(1.015)" : "none",
                  transition: "opacity .3s var(--snap), background .3s var(--snap), transform .2s var(--snap)",
                }}
              >
                <div className="truncate" style={{ fontSize: "clamp(15px,1.5vw,28px)", fontWeight: 700, width: "24%" }}>
                  {player?.name ?? "—"}
                </div>
                <div className="truncate" style={{ flex: 1, fontSize: "clamp(14px,1.4vw,26px)" }}>
                  {visible ? entry.response.trim() || "— nothing —" : "…"}
                </div>
                <div
                  className="num"
                  style={{
                    fontSize: "clamp(13px,1.2vw,22px)",
                    fontWeight: 600,
                    color: entry.judged === "correct" ? C.good : entry.judged === "wrong" ? C.warn : C.special,
                    minWidth: 90,
                    textAlign: "right",
                  }}
                >
                  {entry.judged ? (entry.judged === "correct" ? "+" : "−") + money(entry.wager ?? 0) : visible ? money(entry.wager ?? 0) : "?"}
                </div>
                <div
                  className="display num"
                  style={{
                    fontSize: "clamp(16px,1.5vw,28px)",
                    // Masked until called: the score column would give away the order.
                    color: !visible ? C.edge : (player?.score ?? 0) < 0 ? C.warn : C.accent,
                    minWidth: 100,
                    textAlign: "right",
                  }}
                >
                  {visible ? money(player?.score ?? 0) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {final.phase === "done" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Icon name="crown" size={36} style={{ color: C.accent }} fill />
          <div className="display anim-dd" style={{ position: "relative", overflow: "hidden", fontSize: "clamp(32px,4vw,68px)", color: C.accent, padding: "0 8px" }}>
            {state.players.slice().sort((a, b) => b.score - a.score)[0]?.name ?? "—"}
            <span
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,.5) 50%, transparent 65%)",
                animation: "sheen 1.6s var(--snap) .5s both",
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function Waiting({ room, connected, hasState }: { room: string; connected: boolean; hasState: boolean }) {
  return (
    <main style={{ height: "100dvh", display: "grid", placeItems: "center", background: "var(--scene-landing)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div className="spinner" style={{ width: 44, height: 44, borderWidth: 4 }} />
        <div style={{ fontSize: 28, fontWeight: 600, color: C.dim }}>
          {!connected ? "Connecting…" : hasState ? "Waiting for the host to pick a quiz" : "Joining…"}
        </div>
        <div className="mono" style={{ fontSize: 40, fontWeight: 600, letterSpacing: ".18em", color: C.accent }}>
          {room}
        </div>
      </div>
    </main>
  );
}
