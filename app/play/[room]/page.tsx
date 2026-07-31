"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { alpha, C, mono, money, SCENE, tintFor } from "../../../lib/theme";
import { TINT_COUNT } from "../../../lib/themes";
import { Score } from "../../../components/Score";
import { useRole } from "../../../lib/useRoom";
import { useTheme } from "../../../lib/useTheme";
import { readJson, writeJson } from "../../../lib/storage";
import { useSound } from "../../../lib/sound";
import { useCountdown } from "../../../lib/useCountdown";
import { standings, type FinalEntry, type FinalPhase } from "../../../shared/protocol";

/** What this phone remembers about its owner between games. */
interface Profile {
  name: string;
  cls: string;
  /** Index into the theme's tints. */
  tint: number;
}

/** 1st, 2nd, 3rd, 4th … */
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "TH";
  return ["TH", "ST", "ND", "RD"][n % 10] ?? "TH";
}

export default function PhoneBuzzer() {
  const room = String(useParams().room ?? "").toUpperCase();
  const [name, setName] = useState("");
  const [cls, setCls] = useState("");
  const [tint, setTint] = useState(0);
  const [named, setNamed] = useState(false);
  const [draft, setDraft] = useState<Profile>({ name: "", cls: "", tint: 0 });

  // Restore a previous identity so a refresh mid-game doesn't ask again.
  useEffect(() => {
    const saved = readJson<Partial<Profile>>("player-name");
    if (!saved) return; // first time here, or storage unavailable
    // Colour was added after the fact, so a profile saved before it exists has
    // no tint. Picking one at random beats defaulting everybody to the same.
    const restored: Profile = {
      name: saved.name ?? "",
      cls: saved.cls ?? "",
      tint: typeof saved.tint === "number" ? saved.tint : Math.floor(Math.random() * TINT_COUNT),
    };
    setName(restored.name);
    setCls(restored.cls);
    setTint(restored.tint);
    setDraft(restored);
    setNamed(true);
  }, []);

  // An empty name is left empty rather than defaulted here: the theme that
  // decides what an unnamed player is called comes from the board, which
  // arrives over this very connection. The room fills the blank instead.
  const { state, you, connected, error, send } = useRole(room, "player", name, cls);

  const theme = useTheme(state?.game?.theme);

  // Phones only confirm your own actions — a room of them echoing the TV would
  // be chaos. Vibration where it exists, a short tone otherwise.
  const sound = useSound(true);
  const myBuzz = !!you && (state?.buzzes ?? []).some((b) => b.playerId === you);
  const iAmFirst = !!you && state?.buzzes?.[0]?.playerId === you;
  sound.useCueOn(myBuzz, "buzz");
  sound.useCueOn(iAmFirst, "correct");

  // Distinct haptics: a thump when your buzz lands, a double tap when it turns
  // out you were first. You can tell them apart without looking.
  useEffect(() => {
    if (myBuzz && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(55);
  }, [myBuzz]);
  useEffect(() => {
    if (iAmFirst && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([40, 60, 90]);
  }, [iAmFirst]);

  // Drives the ring that leaves the button on press.
  const [wave, setWave] = useState(0);

  // Every hook must live above the early returns below. This screen returns
  // early for the name gate, the standings and the lobby, so a hook placed
  // after them runs on some renders and not others — which is React error #310.
  const final = state?.final ?? null;
  const finalTimer = useCountdown(
    final?.phase === "clue" && !final.writingClosed && state?.timed ? (state?.shownAt ?? null) : null,
    state?.timerSeconds ?? 30,
    state?.readSeconds ?? 0,
  );
  // Drives the "buzzers open in…" state on the buzzer itself.
  const clueTimer = useCountdown(state?.shownAt ?? null, state?.timerSeconds ?? 20, state?.readSeconds ?? 0);

  const commitName = () => {
    const next: Profile = {
      name: draft.name.trim().toUpperCase() || theme.copy.defaultPlayerName,
      cls: draft.cls.trim().toUpperCase(),
      tint: draft.tint,
    };
    setName(next.name);
    setCls(next.cls);
    setTint(next.tint);
    setNamed(true);
    writeJson("player-name", next);
    send({ type: "rename", ...next });
  };

  if (!named) {
    return (
      <Frame>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, width: "100%", maxWidth: 340 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".3em", color: C.muted }}>JOINING ROOM</div>
            <div style={{ fontFamily: mono, fontSize: 40, fontWeight: 600, letterSpacing: ".2em", color: C.accent }}>
              {room}
            </div>
          </div>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && commitName()}
            placeholder="YOUR NAME"
            maxLength={24}
            autoFocus
            style={{ padding: 16, fontSize: 20, fontWeight: 600, textAlign: "center", letterSpacing: ".05em" }}
          />
          {/* A theme that names its classes offers them as a choice; one that
              does not falls back to free text. Typing "TITAN" correctly on a
              phone keyboard, in a dark room, is not a thing to ask of anyone. */}
          {theme.classes.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".24em", color: C.dim, textAlign: "center" }}>
                {theme.copy.classLabel}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {theme.classes.map((option) => {
                  const on = draft.cls === option;
                  return (
                    <button
                      key={option}
                      onClick={() => setDraft((d) => ({ ...d, cls: on ? "" : option }))}
                      className="tap"
                      style={{
                        flex: 1,
                        padding: "14px 6px",
                        fontFamily: mono,
                        fontSize: 11,
                        letterSpacing: ".1em",
                        fontWeight: 600,
                        color: on ? C.onAccent : C.dim,
                        background: on ? C.accent : C.surface,
                        border: `1px solid ${on ? C.accent : C.edge}`,
                      }}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <input
              value={draft.cls}
              onChange={(e) => setDraft((d) => ({ ...d, cls: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && commitName()}
              placeholder={`${theme.copy.classLabel} (OPTIONAL)`}
              maxLength={24}
              style={{ padding: 14, fontFamily: mono, fontSize: 12, textAlign: "center", letterSpacing: ".14em" }}
            />
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".24em", color: C.dim, textAlign: "center" }}>
              YOUR COLOUR
            </div>
            {/* This is the stripe beside your name on the TV all night, so it
                is worth choosing rather than being handed by seat order. */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {Array.from({ length: TINT_COUNT }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setDraft((d) => ({ ...d, tint: i }))}
                  aria-label={`Colour ${i + 1}`}
                  className="tap"
                  style={{
                    width: 40,
                    height: 40,
                    padding: 0,
                    background: tintFor(i),
                    border: draft.tint === i ? `3px solid ${C.text}` : `1px solid ${C.edge}`,
                    opacity: draft.tint === i ? 1 : 0.55,
                  }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={commitName}
            style={{
              padding: 18,
              fontFamily: mono,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: ".2em",
              color: C.onAccent,
              background: C.accent,
              border: "none",
            }}
          >
            {theme.copy.joinLabel}
          </button>
        </div>
      </Frame>
    );
  }

  const me = state?.players.find((p) => p.id === you) ?? null;
  const open = state?.open ?? null;
  const phase = state?.phase ?? "buzz";
  const dd = state?.dd ?? null;
  const ddMine = !!dd && dd.playerId === you;
  const ddOwner = dd ? (state?.players.find((p) => p.id === dd.playerId) ?? null) : null;
  const buzzes = state?.buzzes ?? [];
  const myIndex = buzzes.findIndex((b) => b.playerId === you);
  const spent = you ? (state?.spent ?? []).includes(you) : false;
  const locked = state?.lockout === "first-only" && buzzes.length > 0 && myIndex === -1;

  // A Daily Double belongs to one player; for everyone else the buzzer is dead.
  // The clue is up but is still being read out. The server refuses buzzes for
  // this whole stretch, so the button must genuinely be dead — but visibly
  // counting down rather than merely disabled, or the phone reads as broken.
  const reading = clueTimer.waiting && !!open && phase === "buzz";
  const canBuzz =
    !!open && phase === "buzz" && !reading && !state?.resolved && myIndex === -1 && !spent && !locked && connected;
  const isFirst = phase === "buzz" ? myIndex === 0 : ddMine && phase === "live";

  // The standings take over every phone, so nobody is staring at a dead buzzer
  // while the room watches the reveal.
  if (state?.results && you) {
    const mine = standings(state.players).find((s) => s.id === you);
    const out = state.results.order.slice(0, state.results.revealed).includes(you);
    const won = out && mine?.rank === 1;
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "40px 22px",
          textAlign: "center",
          background: won
            ? SCENE.winner
            : SCENE.results,
          transition: "background 1s var(--snap)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".32em", color: won ? C.accent : C.special }}>
            FINAL STANDINGS
          </div>
          {out ? (
            <>
              <div key="place" className="anim-pop" style={{ fontSize: 84, fontWeight: 700, lineHeight: 1, color: won ? C.accent : C.text }}>
                {mine?.rank}
                <span style={{ fontSize: 30 }}>{ordinal(mine?.rank ?? 0)}</span>
              </div>
              <Score value={me?.score ?? 0} positiveColor={C.accent} style={{ fontFamily: mono, fontSize: 30, fontWeight: 600 }} />
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".24em", color: won ? C.accent : C.muted, lineHeight: 2 }}>
                {won ? "YOU WON" : "WATCH THE TV"}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 30, fontWeight: 700 }}>{me?.name ?? name}</div>
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".24em", color: C.muted, lineHeight: 2.2 }}>
                YOUR PLACE HASN&apos;T
                <br />
                BEEN CALLED YET
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  // Before the host starts, show that you're in and who else is here — a dead
  // buzzer with no explanation reads as the app being broken.
  if (state && !state.started) {
    return (
      <Frame>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%", maxWidth: 340 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".3em", color: C.muted }}>YOU&apos;RE IN</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: ".03em", textAlign: "center" }}>
            {me?.name ?? name}
          </div>
          <div
            style={{
              width: "100%",
              border: `1px solid ${C.line}`,
              background: "rgba(255,255,255,.03)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: C.faint }}>
              IN THE ROOM · {state.players.length}
            </div>
            {state.players.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, opacity: p.connected ? 1 : 0.45 }}>
                <span
                  style={{ width: 8, height: 8, background: tintFor(p.tint ?? i), transform: "rotate(45deg)", flex: "none" }}
                />
                <span style={{ fontSize: 16, fontWeight: p.id === you ? 700 : 500 }}>
                  {p.name}
                  {p.id === you ? " (YOU)" : ""}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setNamed(false)}
            className="tap"
            style={{
              padding: "12px 18px",
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: ".16em",
              background: C.surface,
              border: `1px solid ${C.line}`,
              color: C.dim,
            }}
          >
            CHANGE MY NAME
          </button>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: C.muted, textAlign: "center", lineHeight: 2 }}>
            WAITING FOR THE HOST
            <br />
            TO START THE GAME
          </div>
        </div>
      </Frame>
    );
  }

  if (final && you) {
    const entry = final.entries[you] ?? null;
    return (
      <FinalScreen
        phase={final.phase}
        entry={entry}
        score={me?.score ?? 0}
        category={state?.game?.final?.category ?? ""}
        clue={final.phase === "wager" ? "" : (state?.game?.final?.t ?? "")}
        writingClosed={final.writingClosed}
        secondsLeft={
          final.phase === "clue" && !final.writingClosed && state?.timed ? finalTimer.remaining : null
        }
        beingRevealed={final.phase === "reveal" ? final.order[final.revealIndex] === you : false}
        onWager={(wager) => send({ type: "setFinalWager", wager })}
        onResponse={(response) => send({ type: "setFinalResponse", response })}
      />
    );
  }

  if (phase === "wager" && dd) {
    return ddMine ? (
      <WagerScreen
        min={dd.min}
        max={dd.max}
        score={me?.score ?? 0}
        onLock={(wager) => send({ type: "setWager", wager })}
      />
    ) : (
      <Frame>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 18, padding: "0 24px" }}>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".3em", color: C.warn }}>DAILY DOUBLE</div>
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.2 }}>{ddOwner?.name ?? "SOMEONE"}</div>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".24em", color: C.muted, lineHeight: 2 }}>
            IS CHOOSING A WAGER.
            <br />
            THIS ONE ISN&apos;T YOURS — SIT IT OUT.
          </div>
        </div>
      </Frame>
    );
  }

  // Between clues, whoever has control is told it is their turn. Everyone else
  // is told whose it is, so the room does not have to ask out loud.
  const iHaveControl = !!you && state?.control === you;
  const controlName = state?.control ? (state.players.find((p) => p.id === state.control)?.name ?? null) : null;

  let hint = "WAIT FOR THE HOST TO OPEN A CLUE";
  let hintColor = C.muted;
  if (!open && controlName) {
    hint = iHaveControl ? "YOUR PICK — CALL IT OUT" : `${controlName} PICKS NEXT`;
    hintColor = iHaveControl ? C.accent : C.muted;
  }
  if (!connected) {
    hint = "RECONNECTING…";
    hintColor = C.warn;
  } else if (phase === "live" && dd) {
    hint = ddMine
      ? `YOUR DAILY DOUBLE — YOU WAGERED ${money(dd.wager ?? 0)}`
      : `DAILY DOUBLE · ${ddOwner?.name ?? "SOMEONE"} IS ANSWERING`;
    hintColor = ddMine ? C.accent : C.muted;
  } else if (reading) {
    hint = "LISTEN — BUZZERS OPEN IN A MOMENT";
    hintColor = C.info;
  } else if (state?.resolved) {
    hint = "THAT ONE'S SETTLED — ANSWER IS ON THE TV";
    hintColor = C.muted;
  } else if (spent) {
    hint = "YOU MISSED THIS ONE — SIT IT OUT";
    hintColor = C.warn;
  } else if (isFirst) {
    hint = "YOU'RE UP — ANSWER OUT LOUD";
    hintColor = C.accent;
  } else if (myIndex > 0) {
    hint = `QUEUED · POSITION ${myIndex + 1}`;
    hintColor = C.info;
  } else if (locked) {
    hint = "SOMEONE BEAT YOU TO IT";
    hintColor = C.muted;
  } else if (open) {
    hint = "CLUE IS LIVE — HIT IT THE SECOND YOU KNOW";
    hintColor = C.info;
  }

  return (
    <Frame first={isFirst}>
      <header
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "18px 22px",
          borderBottom: "1px solid rgba(255,255,255,.08)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: ".04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {me?.name ?? name}
          </div>
          <button
            onClick={() => setNamed(false)}
            style={{ padding: 0, background: "none", border: "none", fontFamily: mono, fontSize: 9, letterSpacing: ".18em", color: C.dim }}
          >
            {cls || theme.copy.classFallback} · CHANGE
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: C.dim }}>YOUR SCORE</div>
          {/* Only ever your own — the rest of the room is on the big screen. */}
          <Score
            value={me?.score ?? 0}
            positiveColor={C.accent}
            style={{ fontFamily: mono, fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}
          />
        </div>
      </header>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30, width: "100%" }}>
        <div
          key={hint}
          className="anim-pop"
          style={{
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: ".26em",
            color: hintColor,
            textAlign: "center",
            lineHeight: 1.9,
            minHeight: 40,
            padding: "0 20px",
            transition: "color .2s var(--snap)",
          }}
        >
          {hint}
        </div>

        <button
          onClick={() => {
            setWave((n) => n + 1);
            send({ type: "buzz" });
          }}
          disabled={!canBuzz}
          className="tap"
          style={{
            position: "relative",
            isolation: "isolate",
            width: "min(74vw, 280px)",
            aspectRatio: "1",
            borderRadius: "50%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
            border: `3px solid ${isFirst ? C.accentSoft : reading ? C.info : canBuzz ? C.dimmer : C.line}`,
            // Armed-and-waiting is its own state, not a shade of "off": it has
            // to look like something about to happen so the room stays ready
            // for it rather than assuming the round has moved on.
            background: isFirst
              ? `radial-gradient(circle at 50% 35%, ${C.accentSoft}, ${C.accent})`
              : reading
                ? `radial-gradient(circle at 50% 35%, ${alpha(C.info, 22)}, ${C.panelDeep})`
                : canBuzz
                  ? `radial-gradient(circle at 50% 35%, ${C.edge}, ${C.surface})`
                  : `radial-gradient(circle at 50% 35%, ${C.surfaceDeep}, ${C.panelDeep})`,
            color: isFirst ? C.accentDeep : C.text,
            animation: canBuzz ? "pulseGlow 2.4s infinite" : undefined,
            opacity: 1,
          }}
        >
          {/* A ring that leaves the button each press — the press is felt even
              when the room is loud and the screen is barely glanced at. */}
          {wave > 0 && (
            <span
              key={wave}
              aria-hidden
              style={{
                position: "absolute",
                inset: -3,
                borderRadius: "50%",
                border: `3px solid ${isFirst ? C.accentSoft : C.info}`,
                animation: "shockwave .55s var(--snap) forwards",
                pointerEvents: "none",
                zIndex: -1,
              }}
            />
          )}
          {/* Unmistakable at a glance that the button is dead — a greyed-out
              circle alone reads as "maybe it's broken". A read delay gets a
              number instead of a padlock: it is a countdown, not a refusal, and
              the difference is what stops people jabbing at the screen. */}
          {!canBuzz && !isFirst && !reading && (
            <div style={{ fontSize: "clamp(26px,9vw,44px)", lineHeight: 1, opacity: 0.85 }}>🔒</div>
          )}
          <div
            key={`${isFirst}-${myIndex}-${reading}`}
            className="anim-pop"
            style={{
              fontSize: reading ? "clamp(44px,18vw,88px)" : "clamp(28px,11vw,52px)",
              fontWeight: 700,
              letterSpacing: ".06em",
              lineHeight: 1,
              color: reading ? C.info : undefined,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {reading
              ? clueTimer.waitRemaining
              : phase === "live" && dd
                ? ddMine
                  ? money(dd.wager ?? 0)
                  : "—"
                : isFirst
                  ? "IN"
                  : myIndex > 0
                    ? String(myIndex + 1)
                    : "BUZZ"}
          </div>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".24em", opacity: 0.72 }}>
            {phase === "live" && dd
              ? ddMine
                ? "YOUR WAGER — ANSWER ALOUD"
                : "NOT YOUR CLUE"
              : isFirst
                ? "YOU'RE FIRST"
                : canBuzz
                  ? "SLAM IT"
                  : spent
                    ? "LOCKED OUT"
                    : "STANDBY"}
          </div>
        </button>

        {error && (
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".14em", color: C.warn, textAlign: "center", padding: "0 20px" }}>
            {error.toUpperCase()}
          </div>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px 22px 26px",
          display: "flex",
          justifyContent: "center",
          gap: 10,
          fontFamily: mono,
          fontSize: 10,
          letterSpacing: ".18em",
          color: C.dimmer,
        }}
      >
        ROOM {room} · {state?.players.filter((p) => p.connected).length ?? 0} CONNECTED
      </div>
    </Frame>
  );
}

/**
 * The final round on a phone: wager blind, then write an answer, then watch.
 *
 * Players who finished the board on zero or below get no entry, so they see a
 * spectator screen rather than a wager form.
 */
function FinalScreen({
  phase,
  entry,
  score,
  category,
  clue,
  writingClosed,
  secondsLeft,
  beingRevealed,
  onWager,
  onResponse,
}: {
  phase: FinalPhase;
  entry: FinalEntry | null;
  score: number;
  category: string;
  clue: string;
  writingClosed: boolean;
  secondsLeft: number | null;
  beingRevealed: boolean;
  onWager: (wager: number) => void;
  onResponse: (response: string) => void;
}) {
  const [wagerDraft, setWagerDraft] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");

  const shell = (children: React.ReactNode) => (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "40px 20px",
        background: beingRevealed
          ? SCENE.winner
          : SCENE.results,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".32em", color: C.special }}>FINAL ROUND</div>
          {category && (
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: ".02em", lineHeight: 1.2 }}>{category}</div>
          )}
        </div>
        {children}
      </div>
    </main>
  );

  if (!entry) {
    return shell(
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: C.muted, lineHeight: 2.2 }}>
        YOU FINISHED ON {money(score)}.
        <br />
        ONLY PLAYERS IN THE BLACK
        <br />
        PLAY THE FINAL ROUND.
      </div>,
    );
  }

  if (phase === "wager") {
    const parsed = Number(wagerDraft.replace(/[^0-9]/g, ""));
    const value = wagerDraft.trim() === "" ? 0 : parsed;
    const clamped = Math.max(0, Math.min(score, Number.isFinite(value) ? value : 0));
    return shell(
      <>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>
          {entry.wager === null ? "HOW MUCH ARE YOU RISKING?" : "WAGER LOCKED"}
        </div>
        <div
          style={{
            background: "rgba(255,255,255,.04)",
            border: `1px solid ${alpha(C.special, 32)}`,
            padding: 16,
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".22em", color: C.dim }}>YOUR SCORE</div>
          <div style={{ fontFamily: mono, fontSize: 32, fontWeight: 600, color: C.accent }}>{money(score)}</div>
        </div>

        {entry.wager === null ? (
          <>
            <input
              value={wagerDraft}
              onChange={(e) => setWagerDraft(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && onWager(clamped)}
              inputMode="numeric"
              placeholder="0"
              autoFocus
              style={{
                padding: "16px 18px",
                fontFamily: mono,
                fontSize: 38,
                fontWeight: 600,
                textAlign: "center",
                border: `2px solid ${C.special}`,
                background: alpha(C.special, 8),
              }}
            />
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".18em", color: C.faint, textAlign: "center" }}>
              ANYTHING FROM 0 TO {money(score)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              <button onClick={() => setWagerDraft("0")} style={quickBtn}>
                NOTHING
              </button>
              <button onClick={() => setWagerDraft(String(Math.round(score / 2)))} style={quickBtn}>
                HALF
              </button>
              <button
                onClick={() => setWagerDraft(String(score))}
                style={{ ...quickBtn, color: C.onAccent, background: C.special, border: "none" }}
              >
                ALL IN
              </button>
            </div>
            <button
              onClick={() => onWager(clamped)}
              style={{
                padding: 18,
                fontFamily: mono,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: ".2em",
                color: C.onAccent,
                background: C.text,
                border: "none",
              }}
            >
              LOCK IN {money(clamped)}
            </button>
          </>
        ) : (
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".2em", color: C.good, lineHeight: 2.2 }}>
            YOU RISKED {money(entry.wager)}.
            <br />
            WAITING FOR THE OTHERS…
          </div>
        )}
      </>,
    );
  }

  if (phase === "clue") {
    return shell(
      <>
        <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.35 }}>{clue}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: C.mutedDeep, flex: 1 }}>
            YOUR RESPONSE
          </div>
          {secondsLeft !== null && (
            <div
              className={secondsLeft <= 5 ? "anim-urgent" : undefined}
              style={{
                fontFamily: mono,
                fontSize: 20,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: secondsLeft <= 5 ? C.accent : C.special,
              }}
            >
              {secondsLeft}s
            </div>
          )}
        </div>
        <input
          value={answerDraft}
          onChange={(e) => {
            setAnswerDraft(e.target.value);
            onResponse(e.target.value);
          }}
          placeholder={writingClosed ? "PENS DOWN" : "What is …?"}
          maxLength={200}
          autoFocus
          disabled={writingClosed}
          style={{
            padding: "16px 18px",
            fontSize: 20,
            fontWeight: 600,
            border: `2px solid ${writingClosed ? C.line : C.special}`,
            opacity: writingClosed ? 0.6 : 1,
          }}
        />
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".18em", color: writingClosed ? C.warn : C.faint, lineHeight: 2 }}>
          {writingClosed ? "PENS DOWN · LOCKED IN" : "SAVED AS YOU TYPE"} · YOU RISKED {money(entry.wager ?? 0)}
        </div>
      </>,
    );
  }

  // reveal / done
  return shell(
    <>
      <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.35 }}>{clue}</div>
      <div
        style={{
          border: `1px solid ${beingRevealed ? C.accent : C.line}`,
          background: beingRevealed ? "rgba(240,196,105,.1)" : "rgba(255,255,255,.03)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: C.mutedDeep }}>YOU WROTE</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{entry.response.trim() || "— nothing —"}</div>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: C.special }}>
          RISKED {money(entry.wager ?? 0)}
        </div>
      </div>
      <div
        style={{
          fontFamily: mono,
          fontSize: 12,
          letterSpacing: ".2em",
          textAlign: "center",
          lineHeight: 2.2,
          color: entry.judged === "correct" ? C.good : entry.judged === "wrong" ? C.warn : C.dim,
        }}
      >
        {entry.judged === "correct"
          ? `CORRECT · NOW ON ${money(score)}`
          : entry.judged === "wrong"
            ? `MISSED · NOW ON ${money(score)}`
            : beingRevealed
              ? "YOU'RE BEING REVEALED NOW"
              : "WATCH THE TV"}
      </div>
    </>,
  );
}

/**
 * The wager screen. Bounds come from the server and the server clamps again on
 * receipt, so this only has to keep the player honest about what they're doing.
 */
function WagerScreen({
  min,
  max,
  score,
  onLock,
}: {
  min: number;
  max: number;
  score: number;
  onLock: (wager: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const parsed = Number(draft.replace(/[^0-9]/g, ""));
  const value = Number.isFinite(parsed) && draft.trim() !== "" ? parsed : min;
  const clamped = Math.max(min, Math.min(max, value));
  const outOfRange = draft.trim() !== "" && clamped !== value;

  const quick = (n: number) => () => setDraft(String(Math.max(min, Math.min(max, n))));

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "40px 20px",
        background: SCENE.results,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22, width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".32em", color: C.special }}>DAILY DOUBLE</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: ".02em", lineHeight: 1.15 }}>
            HOW MUCH ARE YOU RISKING?
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,.04)",
            border: `1px solid ${alpha(C.special, 32)}`,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".22em", color: C.dim }}>YOUR SCORE</div>
          <div style={{ fontFamily: mono, fontSize: 34, fontWeight: 600, color: score < 0 ? C.warn : C.accent }}>
            {money(score)}
          </div>
        </div>

        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && onLock(clamped)}
          inputMode="numeric"
          placeholder={String(min)}
          autoFocus
          style={{
            padding: "18px 20px",
            fontFamily: mono,
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: ".04em",
            textAlign: "center",
            border: `2px solid ${C.special}`,
            background: alpha(C.special, 8),
          }}
        />

        <div
          style={{
            fontFamily: mono,
            fontSize: 10,
            letterSpacing: ".18em",
            color: outOfRange ? C.warn : C.faint,
            textAlign: "center",
          }}
        >
          {outOfRange
            ? `OUT OF RANGE — WILL BE SET TO ${money(clamped)}`
            : `BETWEEN ${money(min)} AND ${money(max)}`}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          <button onClick={quick(min)} style={quickBtn}>
            MIN
          </button>
          <button onClick={quick(Math.round(max / 2))} style={quickBtn}>
            HALF
          </button>
          <button onClick={quick(max)} style={{ ...quickBtn, color: C.onAccent, background: C.special, border: "none" }}>
            ALL IN
          </button>
        </div>

        <button
          onClick={() => onLock(clamped)}
          style={{
            padding: 20,
            fontFamily: mono,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: ".22em",
            color: C.onAccent,
            background: C.text,
            border: "none",
          }}
        >
          LOCK IN {money(clamped)}
        </button>
      </div>
    </main>
  );
}

const quickBtn: React.CSSProperties = {
  padding: "14px 0",
  fontFamily: mono,
  fontSize: 12,
  letterSpacing: ".1em",
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.12)",
};

function Frame({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <main
      style={{
        position: "relative",
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "90px 20px",
        // The whole screen warms when you're first — visible from arm's length.
        transition: "background .35s var(--snap)",
        background: first
          ? SCENE.winner
          : SCENE.landing,
      }}
    >
      {children}
    </main>
  );
}
