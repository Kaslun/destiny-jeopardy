"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { alpha, C, money, tintFor } from "../../../lib/theme";
import { DEFAULT_THEME_ID, TINT_COUNT } from "../../../lib/themes";
import { Score } from "../../../components/Score";
import { Icon, Mark, Splash } from "../../../components/ui";
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
  tint: number;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

export default function PhoneBuzzer() {
  const room = String(useParams().room ?? "").toUpperCase();
  const [name, setName] = useState("");
  const [cls, setCls] = useState("");
  const [named, setNamed] = useState(false);
  const [draft, setDraft] = useState<Profile>({ name: "", cls: "", tint: 0 });

  // Restore a previous identity so a refresh mid-game doesn't ask again.
  useEffect(() => {
    const saved = readJson<Partial<Profile>>("player-name");
    if (!saved) {
      setDraft((d) => ({ ...d, tint: Math.floor(Math.random() * TINT_COUNT) }));
      return;
    }
    const restored: Profile = {
      name: saved.name ?? "",
      cls: saved.cls ?? "",
      tint: typeof saved.tint === "number" ? saved.tint : Math.floor(Math.random() * TINT_COUNT),
    };
    setName(restored.name);
    setCls(restored.cls);
    setDraft(restored);
    setNamed(true);
  }, []);

  const { state, you, connected, error, send } = useRole(room, "player", name, cls);
  const theme = useTheme(state?.game ? state.game.theme : DEFAULT_THEME_ID, state?.game?.style);

  // Phones only confirm your own actions; the TV is the room's speaker.
  const sound = useSound(true);
  const myBuzz = !!you && (state?.buzzes ?? []).some((b) => b.playerId === you);
  const iAmFirst = !!you && state?.buzzes?.[0]?.playerId === you;
  sound.useCueOn(myBuzz, "buzz");
  sound.useCueOn(iAmFirst, "correct");

  // A thump when your buzz lands, a double tap when you were first.
  useEffect(() => {
    if (myBuzz && navigator.vibrate) navigator.vibrate(55);
  }, [myBuzz]);
  useEffect(() => {
    if (iAmFirst && navigator.vibrate) navigator.vibrate([40, 60, 90]);
  }, [iAmFirst]);

  const [wave, setWave] = useState(0);

  // Every hook lives above the early returns below (React error #310).
  const final = state?.final ?? null;
  const finalTimer = useCountdown(
    final?.phase === "clue" && !final.writingClosed && state?.timed ? (state?.shownAt ?? null) : null,
    state?.timerSeconds ?? 30,
    state?.readSeconds ?? 0,
  );
  const clueTimer = useCountdown(state?.shownAt ?? null, state?.timerSeconds ?? 20, state?.readSeconds ?? 0);

  const commitName = () => {
    const next: Profile = {
      name: draft.name.trim().slice(0, 24) || theme.copy.defaultPlayerName,
      cls: draft.cls.trim(),
      tint: draft.tint,
    };
    setName(next.name);
    setCls(next.cls);
    setNamed(true);
    writeJson("player-name", next);
    send({ type: "rename", ...next });
  };

  /* ---------------- join ---------------- */
  if (!named) {
    return (
      <Frame>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commitName();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 22, width: "100%", maxWidth: 360 }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <Mark mark={theme.mark} size={44} />
            <div className="display" style={{ fontSize: 30 }}>
              {state?.game?.title ?? theme.copy.appName}
            </div>
            <span className="chip mono">Room {room}</span>
          </div>

          <input
            className="input input-lg"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Your name"
            maxLength={24}
            autoFocus
            autoComplete="nickname"
            enterKeyHint="go"
            style={{ height: 60, fontSize: 22, fontWeight: 700, textAlign: "center" }}
          />

          {theme.classes.length > 0 && (
            <div className="seg" style={{ width: "100%" }}>
              {theme.classes.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={draft.cls.toLowerCase() === option.toLowerCase()}
                  onClick={() => setDraft((d) => ({ ...d, cls: d.cls.toLowerCase() === option.toLowerCase() ? "" : option }))}
                  style={{ height: 40 }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }} role="radiogroup" aria-label="Your colour">
            {Array.from({ length: TINT_COUNT }, (_, i) => {
              const on = draft.tint === i;
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`Colour ${i + 1}`}
                  onClick={() => setDraft((d) => ({ ...d, tint: i }))}
                  className="tap"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: tintFor(i),
                    boxShadow: on ? `0 0 0 3px ${C.bg}, 0 0 0 5px ${tintFor(i)}` : "none",
                    transform: on ? "scale(1.05)" : "none",
                  }}
                />
              );
            })}
          </div>

          <button type="submit" className="btn btn-primary btn-xl btn-block">
            {theme.copy.joinLabel}
          </button>
        </form>
      </Frame>
    );
  }

  if (!state) return <Splash>{connected ? "Joining…" : "Connecting…"}</Splash>;

  const me = state.players.find((p) => p.id === you) ?? null;
  const myTint = tintFor(me?.tint ?? draft.tint);
  const open = state.open;
  const phase = state.phase;
  const dd = state.dd;
  const ddMine = !!dd && dd.playerId === you;
  const ddOwner = dd ? (state.players.find((p) => p.id === dd.playerId) ?? null) : null;
  const buzzes = state.buzzes;
  const myIndex = buzzes.findIndex((b) => b.playerId === you);
  const spent = you ? state.spent.includes(you) : false;
  const locked = state.lockout === "first-only" && buzzes.length > 0 && myIndex === -1;
  const reading = clueTimer.waiting && !!open && phase === "buzz";
  const canBuzz = !!open && phase === "buzz" && !reading && !state.resolved && myIndex === -1 && !spent && !locked && connected;
  const isFirst = phase === "buzz" ? myIndex === 0 : ddMine && phase === "live";

  /* ---------------- standings ---------------- */
  if (state.results && you) {
    const mine = standings(state.players).find((s) => s.id === you);
    const out = state.results.order.slice(0, state.results.revealed).includes(you);
    const won = out && mine?.rank === 1;
    return (
      <Frame scene={won ? "winner" : "results"}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
          {out ? (
            <>
              {won && <Icon name="crown" size={40} style={{ color: C.accent }} fill />}
              <div key="place" className="display anim-pop num" style={{ fontSize: 96, color: won ? C.accent : C.text }}>
                {mine?.rank}
                <span style={{ fontSize: 36 }}>{ordinal(mine?.rank ?? 0)}</span>
              </div>
              <Score value={me?.score ?? 0} positiveColor={C.accent} style={{ fontSize: 28, fontWeight: 700 }} />
              <div style={{ fontSize: 18, color: won ? C.accent : C.dim, fontWeight: 600 }}>{won ? "You won!" : "Nice game"}</div>
            </>
          ) : (
            <>
              <div className="spinner" />
              <div style={{ fontSize: 18, color: C.dim }}>Your place is coming up…</div>
            </>
          )}
        </div>
      </Frame>
    );
  }

  /* ---------------- lobby ---------------- */
  if (!state.started) {
    return (
      <Frame>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%", maxWidth: 360, textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: alpha(C.good, 16),
              color: C.good,
            }}
          >
            <Icon name="check" size={36} stroke={2.5} />
          </div>
          <div>
            <div className="display" style={{ fontSize: 32 }}>
              You&apos;re in!
            </div>
            <div style={{ fontSize: 16, color: C.dim, marginTop: 6 }}>The game starts when the host is ready.</div>
          </div>
          <button className="chip tap" onClick={() => setNamed(false)} style={{ height: 40, padding: "0 16px", fontSize: 16, color: C.text }}>
            <span className="dot" style={{ background: myTint, width: 12, height: 12 }} />
            {me?.name ?? name}
            <Icon name="edit" size={14} style={{ color: C.muted }} />
          </button>
          {state.players.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {state.players
                .filter((p) => p.id !== you)
                .map((p, i) => (
                  <span key={p.id} className="chip" style={{ opacity: p.connected ? 1 : 0.45 }}>
                    <span className="dot" style={{ background: tintFor(p.tint ?? i) }} />
                    {p.name}
                  </span>
                ))}
            </div>
          )}
        </div>
      </Frame>
    );
  }

  /* ---------------- final round ---------------- */
  if (final && you) {
    return (
      <FinalScreen
        phase={final.phase}
        entry={final.entries[you] ?? null}
        score={me?.score ?? 0}
        category={state.game?.final?.category ?? ""}
        clue={final.phase === "wager" ? "" : (state.game?.final?.t ?? "")}
        writingClosed={final.writingClosed}
        secondsLeft={final.phase === "clue" && !final.writingClosed && state.timed ? finalTimer.remaining : null}
        beingRevealed={final.phase === "reveal" ? final.order[final.revealIndex] === you : false}
        onWager={(wager) => send({ type: "setFinalWager", wager })}
        onResponse={(response) => send({ type: "setFinalResponse", response })}
        onLock={() => send({ type: "lockFinal" })}
      />
    );
  }

  /* ---------------- daily double wager ---------------- */
  if (phase === "wager" && dd) {
    return ddMine ? (
      <WagerScreen min={dd.min} max={dd.max} score={me?.score ?? 0} onLock={(wager) => send({ type: "setWager", wager })} />
    ) : (
      <Frame scene="dailyDouble">
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <Icon name="zap" size={36} style={{ color: C.special }} fill />
          <div className="display" style={{ fontSize: 28 }}>
            Daily Double
          </div>
          <div style={{ fontSize: 17, color: C.dim }}>{ddOwner?.name ?? "Someone"} is placing a bet</div>
        </div>
      </Frame>
    );
  }

  /* ---------------- buzzer ---------------- */
  const iHaveControl = !!you && state.control === you;
  const controlName = state.control ? (state.players.find((p) => p.id === state.control)?.name ?? null) : null;

  let hint = "Wait for the next clue";
  let hintColor: string = C.dim;
  if (!open && controlName) {
    hint = iHaveControl ? "Your pick!" : `${controlName} picks next`;
    hintColor = iHaveControl ? C.accent : C.dim;
  }
  if (!connected) {
    hint = "Reconnecting…";
    hintColor = C.warn;
  } else if (phase === "live" && dd) {
    hint = ddMine ? "Answer out loud!" : `${ddOwner?.name ?? "Someone"} is answering`;
    hintColor = ddMine ? C.accent : C.dim;
  } else if (reading) {
    hint = "Listen…";
    hintColor = C.info;
  } else if (state.resolved) {
    hint = "The answer's on the TV";
  } else if (spent) {
    hint = "You're out for this one";
    hintColor = C.warn;
  } else if (isFirst) {
    hint = "You're up — answer out loud!";
    hintColor = C.good;
  } else if (myIndex > 0) {
    hint = `You're #${myIndex + 1} in line`;
    hintColor = C.info;
  } else if (locked) {
    hint = "Someone beat you to it";
  } else if (open) {
    hint = "Buzz when you know it";
    hintColor = C.accent;
  }

  const ring = isFirst ? C.good : reading ? C.info : canBuzz ? C.accent : C.line;
  const face = isFirst
    ? `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${C.good}, white 30%), ${C.good})`
    : canBuzz
      ? `radial-gradient(circle at 50% 30%, ${C.accentSoft}, ${C.accent} 70%)`
      : reading
        ? `radial-gradient(circle at 50% 30%, ${alpha(C.info, 22)}, ${C.panel})`
        : `radial-gradient(circle at 50% 30%, ${C.surface}, ${C.panelDeep})`;

  return (
    <Frame scene={isFirst ? "winner" : "landing"}>
      <header
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "max(14px, env(safe-area-inset-top)) 16px 14px",
        }}
      >
        <button
          onClick={() => setNamed(false)}
          className="tap"
          style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, textAlign: "left" }}
          aria-label="Change name or colour"
        >
          <span className="dot" style={{ background: myTint, width: 14, height: 14 }} />
          <span className="truncate" style={{ fontSize: 18, fontWeight: 700 }}>
            {me?.name ?? name}
          </span>
        </button>
        <div style={{ flex: 1 }} />
        <Score value={me?.score ?? 0} positiveColor={C.accent} style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)" }} />
      </header>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, width: "100%" }}>
        <div
          key={hint}
          className="anim-pop"
          style={{ fontSize: 20, fontWeight: 700, color: hintColor, textAlign: "center", minHeight: 30, padding: "0 20px" }}
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
          aria-label="Buzz"
          style={{
            position: "relative",
            isolation: "isolate",
            width: "min(76vw, 300px)",
            aspectRatio: "1",
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            border: `4px solid ${ring}`,
            background: face,
            color: isFirst || canBuzz ? C.onAccent : C.text,
            boxShadow: canBuzz ? `0 18px 60px ${alpha(C.accent, 35)}` : isFirst ? `0 18px 60px ${alpha(C.good, 40)}` : "none",
            animation: canBuzz ? "pulseGlow 2.4s infinite" : undefined,
            opacity: 1,
            cursor: canBuzz ? "pointer" : "default",
          }}
        >
          {wave > 0 && (
            <span
              key={wave}
              aria-hidden
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: "50%",
                border: `4px solid ${isFirst ? C.good : C.accent}`,
                animation: "shockwave .55s var(--snap) forwards",
                pointerEvents: "none",
                zIndex: -1,
              }}
            />
          )}
          <span
            key={`${isFirst}-${myIndex}-${reading}-${canBuzz}`}
            className="anim-pop display num"
            style={{
              fontSize: reading ? "clamp(56px,20vw,96px)" : "clamp(34px,12vw,56px)",
              color: reading ? C.info : undefined,
              display: "grid",
              placeItems: "center",
            }}
          >
            {reading ? (
              clueTimer.waitRemaining
            ) : phase === "live" && dd ? (
              ddMine ? money(dd.wager ?? 0) : <Icon name="lock" size={44} style={{ opacity: 0.6 }} />
            ) : isFirst ? (
              "Go!"
            ) : myIndex > 0 ? (
              `#${myIndex + 1}`
            ) : canBuzz ? (
              "Buzz"
            ) : (
              <Icon name="lock" size={44} style={{ opacity: 0.45 }} />
            )}
          </span>
        </button>

        {error && <div style={{ fontSize: 14, color: C.warn, textAlign: "center", padding: "0 20px" }}>{error}</div>}
      </div>

      <div
        className="mono"
        style={{ position: "absolute", bottom: "max(16px, env(safe-area-inset-bottom))", left: 0, right: 0, textAlign: "center", fontSize: 12, color: C.faint }}
      >
        {room}
      </div>
    </Frame>
  );
}

/* ================================================================ */

/** Final round on a phone: wager blind, write an answer, then watch. */
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
  onLock,
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
  onLock: () => void;
}) {
  const [answerDraft, setAnswerDraft] = useState("");

  const shell = (children: React.ReactNode) => (
    <Frame scene={beingRevealed ? "winner" : "final"} top>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%", maxWidth: 380 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.special }}>Final round</div>
          {category && (
            <div className="display" style={{ fontSize: 28, marginTop: 4 }}>
              {category}
            </div>
          )}
        </div>
        {children}
      </div>
    </Frame>
  );

  if (!entry) {
    return shell(
      <div style={{ fontSize: 17, color: C.dim, lineHeight: 1.5 }}>
        You finished on {money(score)} — only players with points play the final. Watch the TV!
      </div>,
    );
  }

  if (phase === "wager") {
    return shell(
      entry.wager === null ? (
        <Wager min={0} max={score} score={score} onLock={onWager} />
      ) : (
        <Done icon="check" title={`You bet ${money(entry.wager)}`} sub="Waiting for everyone else…" />
      ),
    );
  }

  if (phase === "clue") {
    const closed = writingClosed || entry.locked;
    return shell(
      <>
        <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.4 }}>{clue}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, color: C.muted, flex: 1 }}>You bet {money(entry.wager ?? 0)}</span>
          {secondsLeft !== null && (
            <span
              className={`display num ${secondsLeft <= 5 ? "anim-urgent" : ""}`}
              style={{ fontSize: 24, color: secondsLeft <= 5 ? C.warn : C.special }}
            >
              {secondsLeft}s
            </span>
          )}
        </div>
        <textarea
          className="input"
          value={answerDraft}
          onChange={(e) => {
            setAnswerDraft(e.target.value);
            onResponse(e.target.value);
          }}
          placeholder={closed ? "Pens down" : "What is…?"}
          maxLength={200}
          autoFocus
          disabled={closed}
          rows={3}
          style={{ fontSize: 20, fontWeight: 600, borderWidth: 2, borderColor: closed ? C.line : C.special }}
        />
        {closed ? (
          <div style={{ fontSize: 15, fontWeight: 600, color: C.good, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="lock" size={16} />
            {entry.locked ? "Locked in — watch the TV" : "Pens down — your answer is in"}
          </div>
        ) : (
          <button className="btn btn-primary btn-xl btn-block" onClick={onLock} disabled={!answerDraft.trim()}>
            <Icon name="lock" size={18} /> Lock in answer
          </button>
        )}
      </>,
    );
  }

  return shell(
    <>
      <div style={{ fontSize: 18, lineHeight: 1.4, color: C.dim }}>{clue}</div>
      <div
        className="card"
        style={{
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          borderColor: beingRevealed ? C.accent : C.lineSoft,
          background: beingRevealed ? alpha(C.accent, 10) : C.panel,
        }}
      >
        <div style={{ fontSize: 13, color: C.muted }}>You wrote</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{entry.response.trim() || "— nothing —"}</div>
        <div className="num" style={{ fontSize: 14, color: C.special }}>
          Bet {money(entry.wager ?? 0)}
        </div>
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          textAlign: "center",
          color: entry.judged === "correct" ? C.good : entry.judged === "wrong" ? C.warn : C.dim,
        }}
      >
        {entry.judged === "correct"
          ? `Correct! Now on ${money(score)}`
          : entry.judged === "wrong"
            ? `Not quite — now on ${money(score)}`
            : beingRevealed
              ? "You're being revealed…"
              : "Watch the TV"}
      </div>
    </>,
  );
}

/** Daily Double stake. Bounds come from the server, which clamps again. */
function WagerScreen({ min, max, score, onLock }: { min: number; max: number; score: number; onLock: (w: number) => void }) {
  return (
    <Frame scene="dailyDouble" top>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.special, fontWeight: 600 }}>
          <Icon name="zap" size={18} fill /> Daily Double
        </div>
        <div className="display" style={{ fontSize: 32 }}>
          How much will you bet?
        </div>
        <Wager min={min} max={max} score={score} onLock={onLock} />
      </div>
    </Frame>
  );
}

/** The shared wager form: score, a big number field, quick picks, lock in. */
function Wager({ min, max, score, onLock }: { min: number; max: number; score: number; onLock: (w: number) => void }) {
  const [draft, setDraft] = useState("");
  const parsed = Number(draft.replace(/[^0-9]/g, ""));
  const value = Number.isFinite(parsed) && draft.trim() !== "" ? parsed : min;
  const clamped = Math.max(min, Math.min(max, value));
  const outOfRange = draft.trim() !== "" && clamped !== value;
  const quick = (n: number) => () => setDraft(String(Math.max(min, Math.min(max, n))));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onLock(clamped);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ fontSize: 15, color: C.dim }}>
        You have <b className="num" style={{ color: score < 0 ? C.warn : C.accent }}>{money(score)}</b>
      </div>
      <input
        className="input display num"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        inputMode="numeric"
        placeholder={String(min)}
        autoFocus
        style={{ height: 76, fontSize: 40, textAlign: "center", borderWidth: 2, borderColor: C.special }}
      />
      <div className="num" style={{ fontSize: 13, textAlign: "center", color: outOfRange ? C.warn : C.faint }}>
        {outOfRange ? `Will be set to ${money(clamped)}` : `${money(min)} – ${money(max)}`}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        <button type="button" className="btn btn-lg" onClick={quick(min)}>
          Min
        </button>
        <button type="button" className="btn btn-lg" onClick={quick(Math.round(max / 2))}>
          Half
        </button>
        <button type="button" className="btn btn-lg btn-special" onClick={quick(max)}>
          All in
        </button>
      </div>
      <button type="submit" className="btn btn-primary btn-xl btn-block num">
        Lock in {money(clamped)}
      </button>
    </form>
  );
}

function Done({ icon, title, sub }: { icon: "check"; title: string; sub: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "20px 0" }}>
      <Icon name={icon} size={36} style={{ color: C.good }} stroke={2.5} />
      <div className="display num" style={{ fontSize: 26 }}>
        {title}
      </div>
      <div style={{ color: C.dim }}>{sub}</div>
    </div>
  );
}

function Frame({
  children,
  scene = "landing",
  top = false,
}: {
  children: React.ReactNode;
  scene?: "landing" | "winner" | "results" | "final" | "dailyDouble";
  /** Align to the top — for screens with a keyboard coming up. */
  top?: boolean;
}) {
  return (
    <main
      style={{
        position: "relative",
        minHeight: "100dvh",
        display: "grid",
        placeItems: top ? "start center" : "center",
        padding: top ? "40px 20px" : "84px 20px",
        transition: "background .35s var(--snap)",
        background: `var(--scene-${scene === "dailyDouble" ? "daily-double" : scene})`,
      }}
    >
      {children}
    </main>
  );
}
