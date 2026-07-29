"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { C, mono, money, tintFor } from "../../../lib/theme";
import { Score } from "../../../components/Score";
import { useRole } from "../../../lib/useRoom";
import { useSound } from "../../../lib/sound";
import { standings, type FinalEntry, type FinalPhase } from "../../../shared/protocol";

/** 1st, 2nd, 3rd, 4th … */
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "TH";
  return ["TH", "ST", "ND", "RD"][n % 10] ?? "TH";
}

const NAME_KEY = "guardian-jeopardy/player-name";

export default function PhoneBuzzer() {
  const room = String(useParams().room ?? "").toUpperCase();
  const [name, setName] = useState("");
  const [cls, setCls] = useState("");
  const [named, setNamed] = useState(false);
  const [draft, setDraft] = useState({ name: "", cls: "" });

  // Restore a previous identity so a refresh mid-game doesn't ask again.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { name: string; cls: string };
        setName(parsed.name);
        setCls(parsed.cls);
        setDraft(parsed);
        setNamed(true);
      }
    } catch {
      /* first time here, or storage unavailable — the form handles it */
    }
  }, []);

  const { state, you, connected, error, send } = useRole(room, "player", name || "GUARDIAN", cls);

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

  const commitName = () => {
    const next = { name: draft.name.trim().toUpperCase() || "GUARDIAN", cls: draft.cls.trim().toUpperCase() };
    setName(next.name);
    setCls(next.cls);
    setNamed(true);
    try {
      localStorage.setItem(NAME_KEY, JSON.stringify(next));
    } catch {
      /* not fatal — they just re-enter it next time */
    }
    send({ type: "rename", ...next });
  };

  if (!named) {
    return (
      <Frame>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, width: "100%", maxWidth: 340 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".3em", color: "#7d879c" }}>JOINING ROOM</div>
            <div style={{ fontFamily: mono, fontSize: 40, fontWeight: 600, letterSpacing: ".2em", color: C.gold }}>
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
          <input
            value={draft.cls}
            onChange={(e) => setDraft((d) => ({ ...d, cls: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && commitName()}
            placeholder="CLASS (OPTIONAL)"
            maxLength={24}
            style={{ padding: 14, fontFamily: mono, fontSize: 12, textAlign: "center", letterSpacing: ".14em" }}
          />
          <button
            onClick={commitName}
            style={{
              padding: 18,
              fontFamily: mono,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: ".2em",
              color: "#0a0d14",
              background: C.gold,
              border: "none",
            }}
          >
            JOIN THE FIRETEAM
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
  const canBuzz = !!open && phase === "buzz" && myIndex === -1 && !spent && !locked && connected;
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
            ? "radial-gradient(90% 60% at 50% 35%, #3a2408, #17100a 72%)"
            : "radial-gradient(110% 60% at 50% 10%, #1d1533, #08070f 72%)",
          transition: "background 1s var(--snap)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".32em", color: won ? C.gold : C.violet }}>
            FINAL STANDINGS
          </div>
          {out ? (
            <>
              <div key="place" className="anim-pop" style={{ fontSize: 84, fontWeight: 700, lineHeight: 1, color: won ? C.gold : C.text }}>
                {mine?.rank}
                <span style={{ fontSize: 30 }}>{ordinal(mine?.rank ?? 0)}</span>
              </div>
              <Score value={me?.score ?? 0} positiveColor={C.gold} style={{ fontFamily: mono, fontSize: 30, fontWeight: 600 }} />
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".24em", color: won ? C.gold : "#7d879c", lineHeight: 2 }}>
                {won ? "YOU WON" : "WATCH THE TV"}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 30, fontWeight: 700 }}>{me?.name ?? name}</div>
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".24em", color: "#7d879c", lineHeight: 2.2 }}>
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
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".3em", color: "#7d879c" }}>YOU&apos;RE IN</div>
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
                <span style={{ width: 8, height: 8, background: tintFor(i), transform: "rotate(45deg)", flex: "none" }} />
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
              background: "#141b28",
              border: `1px solid ${C.line}`,
              color: C.dim,
            }}
          >
            CHANGE MY NAME
          </button>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: "#7d879c", textAlign: "center", lineHeight: 2 }}>
            WAITING FOR THE HOST
            <br />
            TO START THE GAME
          </div>
        </div>
      </Frame>
    );
  }

  const final = state?.final ?? null;
  if (final && you) {
    const entry = final.entries[you] ?? null;
    return (
      <FinalScreen
        phase={final.phase}
        entry={entry}
        score={me?.score ?? 0}
        category={state?.game?.final?.category ?? ""}
        clue={final.phase === "wager" ? "" : (state?.game?.final?.t ?? "")}
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
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".3em", color: C.orange }}>DAILY DOUBLE</div>
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.2 }}>{ddOwner?.name ?? "SOMEONE"}</div>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".24em", color: "#7d879c", lineHeight: 2 }}>
            IS CHOOSING A WAGER.
            <br />
            THIS ONE ISN&apos;T YOURS — SIT IT OUT.
          </div>
        </div>
      </Frame>
    );
  }

  let hint = "WAIT FOR THE HOST TO OPEN A CLUE";
  let hintColor = "#7d879c";
  if (!connected) {
    hint = "RECONNECTING…";
    hintColor = C.orange;
  } else if (phase === "live" && dd) {
    hint = ddMine
      ? `YOUR DAILY DOUBLE — YOU WAGERED ${money(dd.wager ?? 0)}`
      : `DAILY DOUBLE · ${ddOwner?.name ?? "SOMEONE"} IS ANSWERING`;
    hintColor = ddMine ? C.gold : "#7d879c";
  } else if (spent) {
    hint = "YOU MISSED THIS ONE — SIT IT OUT";
    hintColor = C.orange;
  } else if (isFirst) {
    hint = "YOU'RE UP — ANSWER OUT LOUD";
    hintColor = C.gold;
  } else if (myIndex > 0) {
    hint = `QUEUED · POSITION ${myIndex + 1}`;
    hintColor = C.cyan;
  } else if (locked) {
    hint = "SOMEONE BEAT YOU TO IT";
    hintColor = "#7d879c";
  } else if (open) {
    hint = "CLUE IS LIVE — HIT IT THE SECOND YOU KNOW";
    hintColor = C.cyan;
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
            style={{ padding: 0, background: "none", border: "none", fontFamily: mono, fontSize: 9, letterSpacing: ".18em", color: "#8b95ab" }}
          >
            {cls || "GUARDIAN"} · CHANGE
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".2em", color: "#8b95ab" }}>SCORE</div>
          <Score
            value={me?.score ?? 0}
            positiveColor={C.gold}
            style={{ fontFamily: mono, fontSize: 22, fontWeight: 600 }}
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
            border: `3px solid ${isFirst ? "#ffe0a0" : canBuzz ? "#3d4a63" : "#232b3c"}`,
            background: isFirst
              ? "radial-gradient(circle at 50% 35%, #ffe0a0, #d99a2e)"
              : canBuzz
                ? "radial-gradient(circle at 50% 35%, #2b3448, #131a28)"
                : "radial-gradient(circle at 50% 35%, #131822, #0a0e15)",
            color: isFirst ? "#241a05" : C.text,
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
                border: `3px solid ${isFirst ? "#ffe0a0" : C.cyan}`,
                animation: "shockwave .55s var(--snap) forwards",
                pointerEvents: "none",
                zIndex: -1,
              }}
            />
          )}
          <div
            key={`${isFirst}-${myIndex}`}
            className="anim-pop"
            style={{ fontSize: "clamp(28px,11vw,52px)", fontWeight: 700, letterSpacing: ".06em", lineHeight: 1 }}
          >
            {phase === "live" && dd
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
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".14em", color: C.orange, textAlign: "center", padding: "0 20px" }}>
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
          color: "#5f6a80",
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
  beingRevealed,
  onWager,
  onResponse,
}: {
  phase: FinalPhase;
  entry: FinalEntry | null;
  score: number;
  category: string;
  clue: string;
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
          ? "radial-gradient(90% 60% at 50% 40%, #3a2408, #17100a 72%)"
          : "radial-gradient(110% 60% at 50% 10%, #1d1533, #08070f 72%)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".32em", color: C.violet }}>FINAL ROUND</div>
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
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: "#7d879c", lineHeight: 2.2 }}>
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
            border: `1px solid rgba(177,140,240,.32)`,
            padding: 16,
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".22em", color: C.dim }}>YOUR SCORE</div>
          <div style={{ fontFamily: mono, fontSize: 32, fontWeight: 600, color: C.gold }}>{money(score)}</div>
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
                border: `2px solid ${C.violet}`,
                background: "rgba(177,140,240,.08)",
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
                style={{ ...quickBtn, color: "#0a0d14", background: C.violet, border: "none" }}
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
                color: "#0a0d14",
                background: C.text,
                border: "none",
              }}
            >
              LOCK IN {money(clamped)}
            </button>
          </>
        ) : (
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".2em", color: C.green, lineHeight: 2.2 }}>
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
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: "#6b7488" }}>YOUR RESPONSE</div>
        <input
          value={answerDraft}
          onChange={(e) => {
            setAnswerDraft(e.target.value);
            onResponse(e.target.value);
          }}
          placeholder="What is …?"
          maxLength={200}
          autoFocus
          style={{ padding: "16px 18px", fontSize: 20, fontWeight: 600, border: `2px solid ${C.violet}` }}
        />
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".18em", color: C.faint, lineHeight: 2 }}>
          SAVED AS YOU TYPE · YOU RISKED {money(entry.wager ?? 0)}
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
          border: `1px solid ${beingRevealed ? C.gold : C.line}`,
          background: beingRevealed ? "rgba(240,196,105,.1)" : "rgba(255,255,255,.03)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: "#6b7488" }}>YOU WROTE</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{entry.response.trim() || "— nothing —"}</div>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: C.violet }}>
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
          color: entry.judged === "correct" ? C.green : entry.judged === "wrong" ? C.orange : C.dim,
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
        background: "radial-gradient(110% 60% at 50% 10%, #1d1533, #08070f 70%)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22, width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".32em", color: C.violet }}>DAILY DOUBLE</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: ".02em", lineHeight: 1.15 }}>
            HOW MUCH ARE YOU RISKING?
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,.04)",
            border: `1px solid rgba(177,140,240,.32)`,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".22em", color: C.dim }}>YOUR SCORE</div>
          <div style={{ fontFamily: mono, fontSize: 34, fontWeight: 600, color: score < 0 ? C.orange : C.gold }}>
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
            border: `2px solid ${C.violet}`,
            background: "rgba(177,140,240,.08)",
          }}
        />

        <div
          style={{
            fontFamily: mono,
            fontSize: 10,
            letterSpacing: ".18em",
            color: outOfRange ? C.orange : C.faint,
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
          <button onClick={quick(max)} style={{ ...quickBtn, color: "#0a0d14", background: C.violet, border: "none" }}>
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
            color: "#0a0d14",
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
          ? "radial-gradient(90% 60% at 50% 45%, #3a2408, #17100a 70%)"
          : "radial-gradient(120% 70% at 50% 0%, #17203a, #07090f 70%)",
      }}
    >
      {children}
    </main>
  );
}
