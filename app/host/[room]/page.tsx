"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { alpha, C, money, tintFor } from "../../../lib/theme";
import { Score } from "../../../components/Score";
import { useRole } from "../../../lib/useRoom";
import { useTheme } from "../../../lib/useTheme";
import { DEFAULT_THEME_ID } from "../../../lib/themes";
import { keyFor, linkWithKey } from "../../../lib/keys";
import { loadBoard, myBoards, type BoardRef } from "../../../lib/boards";
import { ClueMedia } from "../../../components/ClueMedia";
import { JoinPanel } from "../../../components/JoinPanel";
import { ConfirmButton, copyText, Icon, LiveDot, Mark, Popover, Splash, useToast } from "../../../components/ui";
import { useCountdown } from "../../../lib/useCountdown";
import { clueKey, parseGame, roundOf, standings, totalClues, type Player, type RoomState } from "../../../shared/protocol";

type Send = ReturnType<typeof useRole>["send"];

export default function HostConsole() {
  const room = String(useParams().room ?? "").toUpperCase();
  const { state, connected, error, send } = useRole(room, "host");
  const theme = useTheme(state?.game ? state.game.theme : DEFAULT_THEME_ID, state?.game?.style);
  const [toast, notify] = useToast();
  const timer = useCountdown(state?.shownAt ?? null, state?.timerSeconds ?? 20, state?.readSeconds ?? 0);

  const [myBoardList, setMyBoardList] = useState<BoardRef[]>([]);
  useEffect(() => setMyBoardList(myBoards()), []);

  useEffect(() => {
    if (error) notify(error[0].toUpperCase() + error.slice(1), "error");
  }, [error, notify]);

  /**
   * `?board=CODE` from the editor's Play button. Waits for the socket, and
   * fires once: re-sending `setGame` on a reconnect would wipe the scores.
   */
  const preload = useSearchParams().get("board");
  const preloaded = useRef(false);
  useEffect(() => {
    if (!preload || preloaded.current || !connected) return;
    preloaded.current = true;
    void loadByCode(preload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preload, connected]);

  async function loadByCode(which: string) {
    const slug = which.trim().toUpperCase();
    if (!slug) return;
    try {
      const game = await loadBoard(slug);
      send({ type: "setGame", game });
      notify(`Loaded “${game.title}”`);
    } catch (err) {
      notify((err as Error).message.replace(/^./, (c) => c.toUpperCase()), "error");
    }
  }

  if (!state) return <Splash>{connected ? "Opening room…" : "Connecting…"}</Splash>;

  const { game, players, used, open, final, started, results } = state;
  const board = roundOf(game, state.round);
  const roundClues = totalClues(board);
  const roundUsed = used.filter((k) => k.startsWith(`${state.round}-`)).length;
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/play/${room}` : "";

  let body: React.ReactNode;
  if (!game) body = <PickQuiz boards={myBoardList} onLoad={loadByCode} onFile={(g) => send({ type: "setGame", game: g })} notify={notify} />;
  else if (results) body = <ResultsControl state={state} send={send} />;
  else if (final && game.final) body = <FinalControl state={state} send={send} />;
  else if (!started) body = <LobbyControl state={state} room={room} send={send} notify={notify} />;
  else if (open) body = <ClueControl state={state} send={send} timer={timer} />;
  else body = <BoardControl state={state} send={send} />;

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: C.bg }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: `1px solid ${C.lineSoft}`,
          background: C.panelDeep,
          flexWrap: "wrap",
        }}
      >
        <a href="/" className="btn btn-ghost btn-icon" aria-label="Home" title="Home">
          <Icon name="arrowLeft" />
        </a>
        <Mark mark={theme.mark} size={30} />
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div className="display truncate" style={{ fontSize: 19 }}>
            {game?.title ?? "New game"}
          </div>
          {started && board && !results && (
            <div style={{ fontSize: 13, color: C.muted }}>
              {board.name || `Round ${state.round + 1}`} · {roundClues - roundUsed} clues left
            </div>
          )}
        </div>
        <LiveDot connected={connected} />
        <a href={`/tv/${room}`} target="_blank" className="btn">
          <Icon name="tv" /> <span className="hide-sm">Open TV</span>
        </a>
        <button
          className="btn mono"
          title="Copy the invite link"
          onClick={() => copyText(inviteUrl, notify, "Invite link copied")}
          style={{ color: C.accent, letterSpacing: ".14em" }}
        >
          {room}
        </button>
        <Popover
          width={250}
          trigger={({ toggle }) => (
            <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label="Game menu">
              <Icon name="more" />
            </button>
          )}
        >
          {(close) => (
            <>
              <div style={{ padding: "6px 12px 8px", fontSize: 12, color: C.muted }}>Buzzers</div>
              <div style={{ padding: "0 6px 6px" }}>
                <div className="seg" style={{ width: "100%" }}>
                  <button aria-pressed={state.lockout === "queue"} onClick={() => send({ type: "setLockout", lockout: "queue" })}>
                    Queue everyone
                  </button>
                  <button aria-pressed={state.lockout !== "queue"} onClick={() => send({ type: "setLockout", lockout: "first-only" })}>
                    First only
                  </button>
                </div>
              </div>
              <div style={{ height: 1, background: C.lineSoft, margin: "4px 0" }} />
              {state.youAreHost && (
                <button
                  className="menu-item"
                  onClick={() => {
                    copyText(linkWithKey(`/host/${room}`, keyFor("host-key", room)), notify, "Host link copied — whoever opens it can run the game");
                    close();
                  }}
                >
                  <Icon name="link" size={16} /> Copy co-host link
                </button>
              )}
              {started && (
                <button className="menu-item" onClick={() => (send({ type: "returnToLobby" }), close())}>
                  <Icon name="users" size={16} /> Back to lobby
                </button>
              )}
              {game && (
                <ConfirmButton className="menu-item" confirmLabel="Tap again — scores go to zero" onConfirm={() => (send({ type: "resetBoard" }), close())}>
                  <Icon name="refresh" size={16} /> Restart game
                </ConfirmButton>
              )}
              <ConfirmButton className="menu-item danger" confirmLabel="Tap again — ends it for everyone" onConfirm={() => (send({ type: "closeRoom" }), close())}>
                <Icon name="logout" size={16} /> Close room
              </ConfirmButton>
            </>
          )}
        </Popover>
      </header>

      {!state.youAreHost && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            fontSize: 14,
            color: C.warn,
            background: alpha(C.warn, 10),
            borderBottom: `1px solid ${alpha(C.warn, 30)}`,
          }}
        >
          <Icon name="eye" size={16} />
          <span style={{ flex: 1 }}>Someone else is hosting this room — you can watch, but not control it.</span>
          <a href="/" className="btn btn-sm">
            Start my own
          </a>
        </div>
      )}

      <div className="host-body" style={{ flex: 1, minHeight: 0 }}>
        <section className="scroll" style={{ padding: "clamp(14px,2vw,24px)", minWidth: 0 }}>
          {body}
        </section>
        {game && <Scoreboard state={state} send={send} />}
      </div>
      {toast}
    </main>
  );
}

/* ================================================================ */
/* No quiz yet                                                       */
/* ================================================================ */

function PickQuiz({
  boards,
  onLoad,
  onFile,
  notify,
}: {
  boards: BoardRef[];
  onLoad: (code: string) => void;
  onFile: (game: NonNullable<RoomState["game"]>) => void;
  notify: (t: string, tone?: "ok" | "error" | "info") => void;
}) {
  const [code, setCode] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24, paddingTop: 12 }}>
      <h1 className="display" style={{ margin: 0, fontSize: 32 }}>
        Pick a quiz
      </h1>

      {boards.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10 }}>
          {boards.map((b) => (
            <button
              key={b.slug}
              onClick={() => onLoad(b.slug)}
              className="card lift tap"
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, padding: 16, textAlign: "left" }}
            >
              <span className="truncate" style={{ fontSize: 16, fontWeight: 600, maxWidth: "100%" }}>
                {b.title || "Untitled quiz"}
              </span>
              <span className="mono" style={{ fontSize: 12, color: C.muted }}>
                {b.slug}
              </span>
            </button>
          ))}
        </div>
      )}

      <form
        className="card"
        style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          onLoad(code);
        }}
      >
        <label htmlFor="code" style={{ fontSize: 14, fontWeight: 600, color: C.dim }}>
          {boards.length ? "Or use someone else's quiz code" : "Enter a quiz code"}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="code"
            className="input input-lg mono"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="ABC123"
            maxLength={12}
            style={{ fontWeight: 600, letterSpacing: ".16em" }}
          />
          <button className="btn btn-primary btn-lg" disabled={!code.trim()}>
            Load
          </button>
        </div>
      </form>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a href="/edit" target="_blank" className="btn">
          <Icon name="plus" size={16} /> Create a new quiz
        </a>
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={16} /> Load from a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const game = parseGame(JSON.parse(await file.text()));
              if (!game) throw new Error("That file isn't a quiz");
              onFile(game);
              notify(`Loaded “${game.title}”`);
            } catch (err) {
              notify((err as Error).message, "error");
            }
          }}
        />
      </div>
    </div>
  );
}

/* ================================================================ */
/* Lobby                                                             */
/* ================================================================ */

function LobbyControl({
  state,
  room,
  send,
  notify,
}: {
  state: RoomState;
  room: string;
  send: Send;
  notify: (t: string, tone?: "ok" | "error" | "info") => void;
}) {
  const players = state.players;
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card" style={{ padding: 20, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <JoinPanel room={room} size={150} compact />
        <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 15, color: C.dim }}>Players scan the code or type the room code on the home page.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href={`/tv/${room}`} target="_blank" className="btn">
              <Icon name="tv" size={16} /> Open TV screen
            </a>
            <button className="btn" onClick={() => copyText(`${location.origin}/play/${room}`, notify, "Invite link copied")}>
              <Icon name="link" size={16} /> Copy invite link
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div className="eyebrow">Players</div>
        <div className="num" style={{ fontWeight: 700, color: C.info }}>
          {players.length}
        </div>
      </div>
      {players.length === 0 ? (
        <div
          style={{
            border: `1.5px dashed ${C.line}`,
            borderRadius: "var(--r-lg)",
            padding: 28,
            textAlign: "center",
            color: C.faint,
          }}
        >
          Waiting for people to join…
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {players.map((p, i) => (
            <span
              key={p.id}
              className="chip anim-pop"
              style={{ height: 36, padding: "0 14px", fontSize: 15, color: C.text, opacity: p.connected ? 1 : 0.5 }}
            >
              <span className="dot" style={{ background: tintFor(p.tint ?? i), width: 10, height: 10 }} />
              {p.name}
            </span>
          ))}
        </div>
      )}

      <button className="btn btn-primary btn-xl btn-block" onClick={() => send({ type: "startGame" })} style={{ marginTop: 8 }}>
        <Icon name="play" size={18} /> Start game
      </button>
    </div>
  );
}

/* ================================================================ */
/* Board                                                             */
/* ================================================================ */

function BoardControl({ state, send }: { state: RoomState; send: Send }) {
  const { game, players, used, control } = state;
  const board = roundOf(game, state.round);
  if (!game || !board) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {game.rounds.length > 1 && (
          <div className="seg">
            {game.rounds.map((r, i) => {
              const done = totalClues(r) > 0 && used.filter((k) => k.startsWith(`${i}-`)).length >= totalClues(r);
              return (
                <button key={r.id ?? i} aria-pressed={i === state.round} onClick={() => send({ type: "setRound", index: i })}>
                  {r.name || `Round ${i + 1}`}
                  {done && i !== state.round ? " ✓" : ""}
                </button>
              );
            })}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {players.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: C.muted }}>Picks next</span>
            <select
              className="input"
              value={control ?? ""}
              onChange={(e) => send({ type: "setControl", playerId: e.target.value || null })}
              style={{ height: 36, width: "auto", minWidth: 140, fontSize: 14, fontWeight: 600 }}
            >
              <option value="">Nobody</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${board.categories.length}, minmax(0,1fr))`, gap: 6 }}>
        {board.categories.map((cat, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <div
              className="display shape"
              style={{
                fontSize: 13,
                textAlign: "center",
                padding: "10px 6px",
                minHeight: 52,
                display: "grid",
                placeItems: "center",
                background: C.surface,
                borderTop: `3px solid ${C.accent}`,
                overflowWrap: "anywhere",
              }}
            >
              {cat.name || "—"}
            </div>
            {board.values.map((value, ri) => {
              const spent = used.includes(clueKey(state.round, ci, ri));
              return (
                <button
                  key={ri}
                  disabled={spent}
                  onClick={() => send({ type: "openClue", c: ci, r: ri })}
                  className={`display num shape ${spent ? "" : "tile"}`}
                  style={{
                    height: "clamp(48px,8vh,72px)",
                    fontSize: "clamp(16px,1.8vw,24px)",
                    color: spent ? "transparent" : C.accent,
                    background: spent ? C.panelDeep : `linear-gradient(180deg,${C.surface},${C.tile})`,
                    border: `1px solid ${spent ? C.lineFaint : C.edgeSoft}`,
                    opacity: spent ? 0.6 : 1,
                  }}
                  aria-label={spent ? "Played" : `${cat.name} for ${value}`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================ */
/* Clue                                                              */
/* ================================================================ */

function ClueControl({
  state,
  send,
  timer,
}: {
  state: RoomState;
  send: Send;
  timer: ReturnType<typeof useCountdown>;
}) {
  const { game, players, open, buzzes, revealed, resolved, phase, dd, control } = state;
  const board = roundOf(game, state.round);
  const clue = open && board ? board.categories[open.c]?.clues[open.r] : null;

  // Y / N to rule on whoever is up, so the host can keep eyes on the room.
  const canJudge = !resolved && (phase === "live" ? !!dd : buzzes.length > 0);
  useEffect(() => {
    if (!canJudge) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "y" || e.key === "Y") send({ type: "judge", correct: true });
      if (e.key === "n" || e.key === "N") send({ type: "judge", correct: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canJudge, send]);

  if (!open || !clue || !board) return null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const reading = timer.waiting && phase === "buzz";
  const stake = dd?.wager ?? board.values[open.r];
  const ddOwner = dd ? byId.get(dd.playerId) : null;

  const status =
    phase === "wager"
      ? { text: "Waiting for a wager", color: C.special }
      : reading
        ? { text: `Reading · buzzers open in ${timer.waitRemaining}s`, color: C.info }
        : resolved
          ? { text: "Answered", color: C.good }
          : !state.timed
            ? { text: "No timer", color: C.muted }
            : timer.expired
              ? { text: "Time's up", color: C.warn }
              : { text: `${timer.remaining}s left`, color: timer.remaining <= 5 ? C.accent : C.muted };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card shape"
        style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14, borderLeft: `4px solid ${clue.dd ? C.special : C.accent}` }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="display" style={{ fontSize: 15, color: C.accent }}>
            {board.categories[open.c]?.name} · {board.values[open.r]}
          </span>
          {clue.dd && (
            <span className="chip" style={{ color: C.onAccent, background: C.special }}>
              <Icon name="zap" size={12} fill /> Daily Double
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span className="chip num" style={{ color: status.color, background: alpha(status.color, 14) }}>
            {status.text}
          </span>
        </div>
        {clue.mediaKey && clue.media && (
          <div style={{ width: 260, maxWidth: "100%" }}>
            <ClueMedia media={clue.media} mediaKey={clue.mediaKey} label={clue.mediaLabel} height={150} border={C.line} />
          </div>
        )}
        {clue.t.trim() ? (
          <div style={{ fontSize: "clamp(20px,2.4vw,28px)", fontWeight: 500, lineHeight: 1.35 }}>{clue.t}</div>
        ) : (
          <div className="dim">The {clue.media ?? "media"} is the clue — nothing to read out.</div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, borderTop: `1px dashed ${C.edgeSoft}`, paddingTop: 12 }}>
          <span style={{ fontSize: 13, color: C.muted }}>Answer</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: C.info }}>{clue.a || "—"}</span>
        </div>
      </div>

      {phase === "wager" && dd && (
        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, borderColor: alpha(C.special, 50) }}>
          <div style={{ fontWeight: 600 }}>
            {ddOwner?.name ?? "Someone"} is wagering {money(dd.min)}–{money(dd.max)} on their phone
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: C.muted }}>Wrong player?</span>
            <select
              className="input"
              value={dd.playerId}
              onChange={(e) => send({ type: "setDDPlayer", playerId: e.target.value })}
              style={{ height: 36, width: "auto", fontSize: 14 }}
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === control ? " (picked it)" : ""}
                </option>
              ))}
            </select>
          </div>
          <HostWager min={dd.min} max={dd.max} onLock={(wager) => send({ type: "setWager", wager })} />
        </div>
      )}

      {reading && (
        <button className="btn btn-info btn-lg" onClick={() => send({ type: "openBuzzers" })} style={{ alignSelf: "flex-start" }}>
          <Icon name="zap" size={16} /> Open buzzers now
        </button>
      )}

      {phase === "live" && dd && (
        <Contestant
          name={ddOwner?.name ?? "—"}
          detail={`Wagered ${money(dd.wager ?? 0)}`}
          first
          stake={stake}
          resolved={resolved}
          send={send}
        />
      )}

      {phase === "buzz" && !reading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {buzzes.length === 0 && !resolved && (
            <div style={{ padding: 18, textAlign: "center", color: C.faint, border: `1.5px dashed ${C.line}`, borderRadius: "var(--r-lg)" }}>
              Waiting for a buzz…
            </div>
          )}
          {buzzes.map((b, i) => (
            <Contestant
              key={b.playerId}
              index={i}
              name={byId.get(b.playerId)?.name ?? "—"}
              detail={`${(b.ms / 1000).toFixed(2)}s`}
              first={i === 0}
              stake={stake}
              resolved={resolved}
              send={send}
            />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className={resolved ? "btn btn-primary btn-lg" : "btn"}
          onClick={() => send({ type: "closeClue" })}
          style={resolved ? { flex: 1 } : undefined}
        >
          {resolved ? (
            <>
              Back to the board <Icon name="arrowRight" size={16} />
            </>
          ) : (
            <>
              <Icon name="x" size={16} /> Close clue
            </>
          )}
        </button>
        {phase !== "wager" && !resolved && (
          <button className="btn btn-ghost" onClick={() => send({ type: "reveal", on: !revealed })}>
            <Icon name={revealed ? "eyeOff" : "eye"} size={16} /> {revealed ? "Hide answer" : "Show answer on TV"}
          </button>
        )}
      </div>
    </div>
  );
}

function Contestant({
  index,
  name,
  detail,
  first,
  stake,
  resolved,
  send,
}: {
  index?: number;
  name: string;
  detail: string;
  first: boolean;
  stake: number;
  resolved: boolean;
  send: Send;
}) {
  return (
    <div
      className="anim-row shape"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 14px 12px 16px",
        flexWrap: "wrap",
        borderRadius: "var(--r-md)",
        background: first ? alpha(C.accent, 12) : C.panel,
        border: `1px solid ${first ? alpha(C.accent, 50) : C.lineSoft}`,
        animationDelay: `${(index ?? 0) * 50}ms`,
      }}
    >
      {index !== undefined && (
        <span className="display num" style={{ fontSize: 20, color: first ? C.accent : C.faint, width: 20 }}>
          {index + 1}
        </span>
      )}
      <span style={{ fontSize: 19, fontWeight: 700, minWidth: 0 }} className="truncate">
        {name}
      </span>
      <span className="num" style={{ fontSize: 13, color: C.muted, flex: 1 }}>
        {detail}
      </span>
      {first && !resolved && (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-good btn-lg" onClick={() => send({ type: "judge", correct: true })} title="Correct (Y)">
            <Icon name="check" size={18} stroke={2.5} /> +{money(stake)}
          </button>
          <button className="btn btn-bad btn-lg" onClick={() => send({ type: "judge", correct: false })} title="Wrong (N)">
            <Icon name="x" size={18} stroke={2.5} /> −{money(stake)}
          </button>
        </div>
      )}
    </div>
  );
}

/** For when a player's phone is dead and they call their wager out. */
function HostWager({ min, max, onLock }: { min: number; max: number; onLock: (wager: number) => void }) {
  const [draft, setDraft] = useState("");
  const parsed = Number(draft.replace(/[^0-9]/g, ""));
  const value = draft.trim() === "" ? min : parsed;
  const clamped = Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  return (
    <form
      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
      onSubmit={(e) => {
        e.preventDefault();
        onLock(clamped);
      }}
    >
      <input
        className="input num"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        inputMode="numeric"
        placeholder="Enter it for them"
        style={{ width: 180, height: 38 }}
      />
      <button className="btn btn-sm" style={{ height: 38 }}>
        Lock in {money(clamped)}
      </button>
    </form>
  );
}

/* ================================================================ */
/* Final round                                                       */
/* ================================================================ */

function FinalControl({ state, send }: { state: RoomState; send: Send }) {
  const final = state.final!;
  const clue = state.game!.final!;
  const byId = new Map(state.players.map((p) => [p.id, p]));

  const step =
    final.phase === "wager" ? "Wagering" : final.phase === "clue" ? (final.writingClosed ? "Pens down" : "Writing") : final.phase === "reveal" ? "Revealing" : "Done";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, borderColor: alpha(C.special, 45) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="display" style={{ fontSize: 15, color: C.special }}>
            Final round
          </span>
          <span className="chip" style={{ color: C.special, background: alpha(C.special, 14) }}>
            {step}
          </span>
          <span style={{ flex: 1 }} />
          <span className="display" style={{ fontSize: 15, color: C.accent }}>
            {clue.category}
          </span>
        </div>
        {final.phase === "wager" ? (
          <div className="dim">The clue stays hidden until everyone has wagered.</div>
        ) : (
          <>
            <div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.35 }}>{clue.t}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, borderTop: `1px dashed ${C.edgeSoft}`, paddingTop: 12 }}>
              <span style={{ fontSize: 13, color: C.muted }}>Answer</span>
              <span style={{ fontSize: 19, fontWeight: 700, color: C.info }}>{clue.a}</span>
            </div>
          </>
        )}
      </div>

      {final.phase === "reveal" ? (
        (() => {
          const id = final.order[final.revealIndex];
          const entry = final.entries[id];
          const player = byId.get(id);
          return (
            <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: C.muted }}>
                  {final.revealIndex + 1} of {final.order.length}
                </span>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{player?.name ?? "—"}</span>
                {entry?.judged === null && (
                  <span className="num" style={{ color: C.dim }}>
                    has {money(player?.score ?? 0)}
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "end" }}>
                <div>
                  <div style={{ fontSize: 13, color: C.muted }}>Wrote</div>
                  <div style={{ fontSize: 26, fontWeight: 600 }}>{entry?.response.trim() || "— nothing —"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: C.muted }}>Wagered</div>
                  <div className="display num" style={{ fontSize: 26, color: C.special }}>
                    {money(entry?.wager ?? 0)}
                  </div>
                </div>
              </div>
              {entry?.judged === null ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-good btn-lg" style={{ flex: 1 }} onClick={() => send({ type: "judgeFinal", correct: true })}>
                    <Icon name="check" size={18} stroke={2.5} /> Correct
                  </button>
                  <button className="btn btn-bad btn-lg" style={{ flex: 1 }} onClick={() => send({ type: "judgeFinal", correct: false })}>
                    <Icon name="x" size={18} stroke={2.5} /> Wrong
                  </button>
                </div>
              ) : (
                <div className="chip num" style={{ alignSelf: "flex-start", color: entry?.judged === "correct" ? C.good : C.warn }}>
                  {entry?.judged === "correct" ? "Correct" : "Wrong"} · now {money(player?.score ?? 0)}
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {final.order.map((id) => {
            const entry = final.entries[id];
            const ready = final.phase === "wager" ? entry.wager !== null : entry.locked;
            return (
              <span key={id} className="chip" style={{ height: 34, padding: "0 12px", fontSize: 14, color: ready ? C.text : C.faint }}>
                <Icon name={ready ? "check" : "timer"} size={14} style={{ color: ready ? C.good : C.faint }} />
                {byId.get(id)?.name ?? "—"}
              </span>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {final.phase !== "done" && (
          <button className="btn btn-special btn-lg" style={{ flex: 1 }} onClick={() => send({ type: "finalAdvance" })}>
            {final.phase === "wager"
              ? "Show the clue"
              : final.phase === "clue"
                ? "Start revealing"
                : final.revealIndex < final.order.length - 1
                  ? "Next player"
                  : "Finish"}
            <Icon name="arrowRight" size={16} />
          </button>
        )}
        {final.phase === "clue" && !final.writingClosed && (
          <button className="btn btn-lg" onClick={() => send({ type: "closeFinalWriting" })}>
            <Icon name="hand" size={16} /> Pens down
          </button>
        )}
        {final.phase === "done" ? (
          <>
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={() => send({ type: "showResults" })}>
              <Icon name="trophy" size={16} /> Final standings
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => send({ type: "endFinal" })}>
              Back to the board
            </button>
          </>
        ) : (
          <ConfirmButton className="btn btn-ghost btn-lg" confirmLabel="Tap again to abandon" onConfirm={() => send({ type: "endFinal" })}>
            Abandon
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}

/* ================================================================ */
/* Results                                                           */
/* ================================================================ */

function ResultsControl({ state, send }: { state: RoomState; send: Send }) {
  const results = state.results!;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const left = results.order.length - results.revealed;
  const next = byId.get(results.order[results.revealed] ?? "");
  const ranked = standings(state.players);
  const done = left === 0;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingTop: 12 }}>
      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10, textAlign: "center", alignItems: "center" }}>
        <Icon name="trophy" size={28} style={{ color: done ? C.accent : C.special }} />
        {done ? (
          <div className="display" style={{ fontSize: 28 }}>
            {byId.get(ranked[0]?.id ?? "")?.name ?? "—"} wins with {money(ranked[0]?.score ?? 0)}
          </div>
        ) : (
          <>
            <div style={{ color: C.muted }}>
              Next up · {left === 1 ? "the winner" : `${left} places to go`}
            </div>
            <div className="display" style={{ fontSize: 30 }}>
              {next?.name ?? "—"}
            </div>
            <div className="num dim">{money(next?.score ?? 0)}</div>
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {!done && (
          <button className="btn btn-primary btn-xl" style={{ flex: 1 }} onClick={() => send({ type: "revealNextPlace" })}>
            {left === 1 ? "Reveal the winner" : "Reveal next place"}
          </button>
        )}
        <button className="btn btn-xl" onClick={() => send({ type: "endResults" })} style={done ? { flex: 1 } : undefined}>
          Back to the board
        </button>
      </div>
    </div>
  );
}

/* ================================================================ */
/* Scoreboard                                                        */
/* ================================================================ */

function Scoreboard({ state, send }: { state: RoomState; send: Send }) {
  const { players, started, results, final, game, control } = state;
  return (
    <aside
      className="host-side"
      style={{ borderLeft: `1px solid ${C.lineSoft}`, background: C.panelDeep, display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <div style={{ padding: "14px 16px 6px", display: "flex", alignItems: "center", gap: 8 }}>
        <div className="eyebrow" style={{ flex: 1 }}>
          Scores
        </div>
        <span className="chip">
          <Icon name="users" size={13} /> {players.filter((p) => p.connected).length}
        </span>
      </div>
      <div className="scroll" style={{ flex: 1, padding: "6px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {players.length === 0 && <div style={{ padding: 10, fontSize: 14, color: C.faint }}>Nobody has joined yet.</div>}
        {players.map((p, i) => (
          <PlayerRow key={p.id} player={p} index={i} picking={p.id === control} send={send} />
        ))}
      </div>
      {started && !results && (
        <div style={{ padding: 12, borderTop: `1px solid ${C.lineSoft}`, display: "flex", flexDirection: "column", gap: 8 }}>
          {game?.final && !final && (
            <button className="btn btn-special btn-block" onClick={() => send({ type: "startFinal" })}>
              <Icon name="zap" size={16} fill /> Final round
            </button>
          )}
          <button className="btn btn-block" onClick={() => send({ type: "showResults" })}>
            <Icon name="trophy" size={16} /> End game & show standings
          </button>
        </div>
      )}
    </aside>
  );
}

function PlayerRow({ player: p, index, picking, send }: { player: Player; index: number; picking: boolean; send: Send }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 6px 8px 10px",
        borderRadius: "var(--r-md)",
        background: picking ? alpha(C.accent, 8) : "transparent",
        opacity: p.connected ? 1 : 0.5,
      }}
    >
      <span className="dot" style={{ background: tintFor(p.tint ?? index), width: 10, height: 10 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="truncate" style={{ fontWeight: 600 }}>
          {p.name}
        </div>
        {(!p.connected || picking) && (
          <div style={{ fontSize: 12, color: picking ? C.accent : C.faint }}>{picking ? "Picks next" : "Away"}</div>
        )}
      </div>
      <Score value={p.score} style={{ fontSize: 18, fontWeight: 700 }} />
      <Popover
        width={200}
        trigger={({ toggle }) => (
          <button className="btn btn-ghost btn-icon btn-sm" onClick={toggle} aria-label={`Adjust ${p.name}`}>
            <Icon name="more" size={16} />
          </button>
        )}
      >
        {(close) => (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 6 }}>
              {[-100, 100, -500, 500].map((d) => (
                <button key={d} className="btn btn-sm num" onClick={() => send({ type: "adjust", playerId: p.id, delta: d })}>
                  {d > 0 ? "+" : "−"}
                  {Math.abs(d)}
                </button>
              ))}
            </div>
            <div style={{ height: 1, background: C.lineSoft, margin: "4px 0" }} />
            <ConfirmButton className="menu-item danger" confirmLabel="Tap again to remove" onConfirm={() => (send({ type: "kick", playerId: p.id }), close())}>
              <Icon name="logout" size={16} /> Remove player
            </ConfirmButton>
          </>
        )}
      </Popover>
    </div>
  );
}
