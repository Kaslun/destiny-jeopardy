"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { alpha, C, mono, money, tintFor } from "../../../lib/theme";
import { Score } from "../../../components/Score";
import { useRole } from "../../../lib/useRoom";
import { useTheme } from "../../../lib/useTheme";
import { keyFor, linkWithKey } from "../../../lib/keys";
import { loadBoard, myBoards, type BoardRef } from "../../../lib/boards";
import { ClueMedia } from "../../../components/ClueMedia";
import { JoinPanel } from "../../../components/JoinPanel";
import { useCountdown } from "../../../lib/useCountdown";
import { clueKey, parseGame, roundOf, standings, totalClues } from "../../../shared/protocol";

export default function HostConsole() {
  const room = String(useParams().room ?? "").toUpperCase();
  const { state, connected, error, send } = useRole(room, "host");
  // The console wears whatever the loaded board wears, so the host is looking
  // at the same game the room is.
  const theme = useTheme(state?.game?.theme);
  const [paste, setPaste] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  /** Player id whose kick button is armed. Empty when none is. */
  const [confirmKick, setConfirmKick] = useState("");
  // The host sits next to the TV, so this screen stays silent unless asked.
  const timer = useCountdown(state?.shownAt ?? null, state?.timerSeconds ?? 20, state?.readSeconds ?? 0);

  // The boards this browser has made. Read once on mount — `localStorage` is
  // not available during the server render.
  const [myBoardList, setMyBoardList] = useState<BoardRef[]>([]);
  useEffect(() => setMyBoardList(myBoards()), []);

  /**
   * `?board=CODE`, sent by the editor's "start a game" button.
   *
   * Waits for the socket, because loading a board is a message to the room and
   * there is nothing to send it down yet on the first render. Guarded so it
   * fires once: `connected` flaps on every reconnect, and re-sending `setGame`
   * would silently wipe the scores of a game already in progress.
   */
  const preload = useSearchParams().get("board");
  const preloaded = useRef(false);
  useEffect(() => {
    if (!preload || preloaded.current || !connected) return;
    preloaded.current = true;
    void loadByCode(preload);
  }, [preload, connected]);

  const loadByCode = async (which?: string) => {
    const slug = (which ?? code).trim().toUpperCase();
    if (!slug) return;
    try {
      const game = await loadBoard(slug);
      send({ type: "setGame", game });
      const rounds = game.rounds.length;
      setNote({
        text: `LOADED ${slug} · ${game.rounds[0].categories.length} CATEGORIES${rounds > 1 ? ` · ${rounds} ROUNDS` : ""}`,
        ok: true,
      });
    } catch (err) {
      setNote({ text: (err as Error).message.toUpperCase(), ok: false });
    }
  };

  const loadGame = () => {
    let raw: unknown;
    try {
      raw = JSON.parse(paste);
    } catch (err) {
      setNote({ text: `NOT VALID JSON · ${(err as Error).message.toUpperCase()}`, ok: false });
      return;
    }
    const game = parseGame(raw);
    if (!game) {
      setNote({ text: 'NEEDS A NON-EMPTY "CATEGORIES" ARRAY', ok: false });
      return;
    }
    send({ type: "setGame", game });
    setNote({ text: `LOADED · ${game.rounds[0].categories.length} CATEGORIES`, ok: true });
    setPaste("");
  };

  if (!state) {
    return <Shell room={room}>{connected ? "JOINING ROOM…" : "CONNECTING…"}</Shell>;
  }

  const { game, players, used, open, buzzes, revealed, resolved, lockout, phase, dd, control, final, started, results } =
    state;
  // While this is true the room cannot buzz — the clue is still being read.
  const reading = timer.waiting && phase === "buzz" && !!open;
  const byId = new Map(players.map((p) => [p.id, p]));
  // The board in play. Everything below addresses this round, never the game.
  const board = roundOf(game, state.round);
  const openClue = open && board ? board.categories[open.c]?.clues[open.r] : null;
  // Counted for this round only — "12 clues left" across a whole game would be
  // a number the host cannot act on.
  const roundClues = totalClues(board);
  const roundUsed = used.filter((k) => k.startsWith(`${state.round}-`)).length;
  const ddOwner = dd ? (byId.get(dd.playerId) ?? null) : null;
  // On a Daily Double the stake replaces the tile value in every ruling.
  const atStake = dd?.wager ?? (open && board ? board.values[open.r] : 0);

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 22px",
          borderBottom: `1px solid ${C.lineSoft}`,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: ".1em" }}>HOST CONSOLE</div>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".2em", color: C.muted }}>
          {roundClues - roundUsed} / {roundClues} CLUES LEFT
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: connected ? C.good : C.warn }}>
          {connected ? "● LIVE" : "● OFFLINE"}
        </div>
        <a href={`/tv/${room}`} target="_blank" style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em" }}>
          OPEN TV ↗
        </a>
        {/* The key lives in this browser, so without a way to carry it the host
            is stuck on one device. This is that way — and it is also how a
            co-host takes over when the first one's phone dies. */}
        {state.youAreHost && (
          <button
            onClick={async () => {
              const link = linkWithKey(`/host/${room}`, keyFor("host-key", room));
              try {
                await navigator.clipboard.writeText(link);
                setNote({ text: "HOST LINK COPIED — IT CARRIES YOUR KEY, SHARE IT CAREFULLY", ok: true });
              } catch {
                setNote({ text: link, ok: true });
              }
            }}
            className="tap"
            style={{
              padding: "6px 12px",
              fontFamily: mono,
              fontSize: 11,
              letterSpacing: ".16em",
              background: C.surface,
              border: `1px solid ${C.edge}`,
            }}
          >
            ⧉ HOST LINK
          </button>
        )}
        <div
          style={{
            fontFamily: mono,
            fontSize: 14,
            letterSpacing: ".2em",
            color: C.accent,
            border: `1px solid ${C.accentDeep}`,
            padding: "6px 12px",
          }}
        >
          ROOM {room}
        </div>
      </header>

      {/* Someone opened the host URL without the key. Everything below still
          renders, because watching the console is harmless and useful — but
          nothing they press will reach the room, so say so once, loudly, rather
          than letting them discover it by pressing things that do nothing. */}
      {!state.youAreHost && (
        <div
          style={{
            padding: "14px 22px",
            background: alpha(C.warn, 12),
            borderBottom: `1px solid ${C.warn}`,
            fontFamily: mono,
            fontSize: 12,
            letterSpacing: ".16em",
            color: C.warn,
            lineHeight: 1.9,
          }}
        >
          WATCHING ONLY — THIS ROOM ALREADY HAS A HOST.
          <br />
          <span style={{ color: C.faint }}>
            ASK THEM FOR THE HOST LINK, OR START A FRESH ROOM FROM THE HOME PAGE.
          </span>
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 22px", fontFamily: mono, fontSize: 12, color: C.warn, letterSpacing: ".14em" }}>
          {error.toUpperCase()}
        </div>
      )}

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", minHeight: 0 }}>
        <section style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          {!game && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* The boards made in this browser, offered by name. Typing a code
                  works too, but nobody hosting their own board should have to
                  remember one. */}
              {myBoardList.length > 0 && (
                <>
                  <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".26em", color: C.muted }}>
                    YOUR BOARDS
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))",
                      gap: 8,
                    }}
                  >
                    {myBoardList.map((b) => (
                      <button
                        key={b.slug}
                        onClick={() => loadByCode(b.slug)}
                        className="tap lift"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          gap: 5,
                          padding: "12px 14px",
                          textAlign: "left",
                          background: C.tile,
                          border: `1px solid ${C.line}`,
                          borderLeft: `3px solid ${C.accent}`,
                        }}
                      >
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{b.title || "UNTITLED"}</span>
                        <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: C.accent }}>
                          {b.slug}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 11,
                      letterSpacing: ".22em",
                      color: C.faint,
                      borderTop: `1px solid ${C.lineSoft}`,
                      paddingTop: 14,
                    }}
                  >
                    OR LOAD SOMEONE ELSE&apos;S BY ITS CODE
                  </div>
                </>
              )}
              {myBoardList.length === 0 && (
                <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".26em", color: C.muted }}>
                  LOAD A SAVED BOARD BY ITS CODE
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && loadByCode()}
                  placeholder="ABC123"
                  maxLength={12}
                  style={{
                    padding: "13px 16px",
                    fontFamily: mono,
                    fontSize: 22,
                    fontWeight: 600,
                    letterSpacing: ".2em",
                    color: C.accent,
                    width: 200,
                  }}
                />
                <button
                  onClick={() => loadByCode()}
                  disabled={!code.trim()}
                  style={{
                    padding: "13px 20px",
                    fontFamily: mono,
                    fontSize: 12,
                    letterSpacing: ".16em",
                    fontWeight: 600,
                    color: C.onAccent,
                    background: C.accent,
                    border: "none",
                  }}
                >
                  ↓ LOAD BOARD
                </button>
                <a href="/edit" target="_blank" style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".14em" }}>
                  BUILD ONE ↗
                </a>
              </div>

              <div
                style={{
                  fontFamily: mono,
                  fontSize: 11,
                  letterSpacing: ".22em",
                  color: C.faint,
                  borderTop: `1px solid ${C.lineSoft}`,
                  paddingTop: 14,
                }}
              >
                OR PASTE A GAME AS JSON
              </div>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder='{ "title": "MY GAME", "values": [ 200, 400, 600, 800, 1000 ], "categories": [ … ] }'
                style={{ width: "100%", height: 220, padding: 14, fontFamily: mono, fontSize: 12, lineHeight: 1.7 }}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={loadGame}
                  style={{
                    padding: "12px 20px",
                    fontFamily: mono,
                    fontSize: 12,
                    letterSpacing: ".16em",
                    fontWeight: 600,
                    color: C.onAccent,
                    background: C.good,
                    border: "none",
                  }}
                >
                  ↓ LOAD GAME
                </button>
                <a href="/design/" target="_blank" style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".14em" }}>
                  OPEN THE EDITOR ↗
                </a>
              </div>
              {note && (
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 11,
                    letterSpacing: ".14em",
                    color: note.ok ? C.good : C.warn,
                  }}
                >
                  {note.text}
                </div>
              )}
            </div>
          )}

          {game && open && openClue && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  background: `linear-gradient(120deg,${C.surface},${C.panel})`,
                  border: `1px solid ${C.edgeSoft}`,
                  borderLeft: `4px solid ${C.accent}`,
                  padding: "20px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".26em", color: C.accent }}>
                    {board?.categories[open.c]?.name} · {board?.values[open.r]}
                  </div>
                  {openClue.dd && (
                    <div
                      style={{
                        fontFamily: mono,
                        fontSize: 10,
                        letterSpacing: ".2em",
                        color: C.onAccent,
                        background: C.warn,
                        padding: "3px 9px",
                      }}
                    >
                      DAILY DOUBLE
                    </div>
                  )}
                  <div style={{ flex: 1 }} />
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 15,
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: reading
                        ? C.info
                        : resolved
                          ? C.good
                          : timer.expired
                            ? C.warn
                            : timer.remaining <= 5
                              ? C.accent
                              : C.muted,
                    }}
                  >
                    {phase === "wager"
                      ? "—"
                      : reading
                        ? `READING · BUZZERS OPEN IN ${timer.waitRemaining}s`
                        : resolved
                          ? "ANSWERED · MOVE ON WHEN READY"
                          : !state.timed
                            ? "NO TIMER · CLOSE WHEN READY"
                            : timer.expired
                              ? "TIME UP · BUZZERS CLOSED"
                              : `${timer.remaining}s`}
                  </div>
                </div>
                {openClue.mediaKey && openClue.media && (
                  <div style={{ width: 240 }}>
                    <ClueMedia
                      media={openClue.media}
                      mediaKey={openClue.mediaKey}
                      label={openClue.mediaLabel}
                      height={130}
                      border={C.line}
                    />
                  </div>
                )}
                {openClue.t.trim() ? (
                  <div style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.35 }}>{openClue.t}</div>
                ) : (
                  <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".2em", color: C.muted }}>
                    NOTHING TO READ — THE {(openClue.media ?? "CLUE").toUpperCase()} IS THE QUESTION
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    borderTop: `1px dashed ${C.edgeSoft}`,
                    paddingTop: 14,
                  }}
                >
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".2em", color: C.dim }}>ANSWER</div>
                  <div style={{ fontSize: 21, fontWeight: 700, color: C.info }}>{openClue.a || "—"}</div>
                </div>
              </div>

              {phase === "wager" && dd && (
                <div
                  style={{
                    border: `1px solid ${C.special}`,
                    background: alpha(C.special, 8),
                    padding: "18px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".28em", color: C.special }}>
                    DAILY DOUBLE · WAITING ON A WAGER
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: C.muted }}>
                    WHOSE CLUE IS THIS? {control ? "" : "(NOBODY HAS CONTROL YET — PICK ONE)"}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {players.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => send({ type: "setDDPlayer", playerId: p.id })}
                        style={{
                          padding: "9px 14px",
                          fontFamily: mono,
                          fontSize: 12,
                          letterSpacing: ".1em",
                          fontWeight: 600,
                          color: p.id === dd.playerId ? C.onAccent : C.text,
                          background: p.id === dd.playerId ? C.special : C.surface,
                          border: `1px solid ${p.id === dd.playerId ? C.special : C.edge}`,
                        }}
                      >
                        {p.name}
                        {p.id === control ? " ◆" : ""}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".16em", color: C.faint }}>
                    {ddOwner?.name ?? "—"} MAY WAGER {money(dd.min)} TO {money(dd.max)} · THEIR PHONE IS ASKING NOW
                  </div>
                  <HostWager min={dd.min} max={dd.max} onLock={(wager) => send({ type: "setWager", wager })} />
                </div>
              )}

              {phase === "live" && dd && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".24em", color: C.muted }}>
                    DAILY DOUBLE — ONLY THIS PLAYER MAY ANSWER
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 16px",
                      background: alpha(C.special, 12),
                      border: `1px solid ${C.special}`,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 19, fontWeight: 600, minWidth: 140 }}>{ddOwner?.name ?? "—"}</div>
                    <div style={{ fontFamily: mono, fontSize: 13, color: C.special, flex: 1 }}>
                      WAGERED {money(dd.wager ?? 0)}
                    </div>
                    {resolved ? (
                      <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".2em", color: C.good }}>
                        RULED · ANSWER IS UP
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => send({ type: "judge", correct: true })} style={judgeBtn(C.good)}>
                          ✓ CORRECT +{money(atStake)}
                        </button>
                        <button onClick={() => send({ type: "judge", correct: false })} style={judgeBtn(C.warn)}>
                          ✕ WRONG −{money(atStake)}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {reading && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "16px 18px",
                    border: `1px solid ${C.info}`,
                    background: alpha(C.info, 8),
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: 30,
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: C.info,
                      minWidth: 60,
                    }}
                  >
                    {timer.waitRemaining}s
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: C.info }}>
                      READ IT OUT — NOBODY CAN BUZZ YET
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".14em", color: C.faint, marginTop: 4 }}>
                      THE ROOM SEES THIS COUNTDOWN TOO
                    </div>
                  </div>
                  <button
                    onClick={() => send({ type: "openBuzzers" })}
                    className="tap lift"
                    style={{ ...flatBtn, background: C.info, color: C.onAccent, border: "none", fontWeight: 600 }}
                  >
                    ▶ OPEN BUZZERS NOW
                  </button>
                </div>
              )}

              {phase === "buzz" && !reading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".24em", color: C.muted }}>
                  {resolved ? "SETTLED — THE ANSWER IS UP ON THE TV" : "WHO BUZZED — RULE ON THE PLAYER AT THE TOP"}
                </div>
                {buzzes.length === 0 && !resolved && (
                  <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".16em", color: C.faint, padding: "8px 0" }}>
                    NOBODY HAS BUZZED YET
                  </div>
                )}
                {buzzes.map((b, i) => (
                  <div
                    key={b.playerId}
                    className="anim-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "12px 16px",
                      background: i === 0 ? "rgba(240,196,105,.12)" : "rgba(255,255,255,.025)",
                      border: `1px solid ${i === 0 ? C.accentDeep : C.line}`,
                      flexWrap: "wrap",
                      animationDelay: `${i * 50}ms`,
                      transition: "background .2s var(--snap), border-color .2s var(--snap)",
                    }}
                  >
                    <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 600, color: i === 0 ? C.accent : C.dimmer, width: 22 }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 600, minWidth: 140 }}>
                      {byId.get(b.playerId)?.name ?? "—"}
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 12, color: C.muted, flex: 1 }}>
                      {(b.ms / 1000).toFixed(2)}s
                    </div>
                    {i === 0 && !resolved && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => send({ type: "judge", correct: true })}
                          className="tap lift"
                          style={judgeBtn(C.good)}
                        >
                          ✓ CORRECT +{board?.values[open.r] ?? 0}
                        </button>
                        <button
                          onClick={() => send({ type: "judge", correct: false })}
                          className="tap lift"
                          style={judgeBtn(C.warn)}
                        >
                          ✕ WRONG −{board?.values[open.r] ?? 0}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {phase !== "wager" && !resolved && (
                  <button onClick={() => send({ type: "reveal", on: !revealed })} style={flatBtn}>
                    {revealed ? "◇ HIDE ANSWER ON TV" : "◆ REVEAL ANSWER ON TV"}
                  </button>
                )}
                {/* Once a clue is settled, moving on is the only thing left to
                    do — so it stops being a quiet secondary control. */}
                <button
                  onClick={() => send({ type: "closeClue" })}
                  className="tap lift"
                  style={
                    resolved
                      ? {
                          ...flatBtn,
                          background: `linear-gradient(100deg,${C.accent},${C.good})`,
                          color: C.onAccent,
                          border: "none",
                          fontWeight: 600,
                          letterSpacing: ".2em",
                        }
                      : flatBtn
                  }
                >
                  {resolved ? "▶ NEXT — BACK TO THE BOARD" : "↩ CLOSE (MARKS IT PLAYED)"}
                </button>
              </div>
            </div>
          )}

          {results && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {(() => {
                const byId = new Map(players.map((p) => [p.id, p]));
                const left = results.order.length - results.revealed;
                const nextId = results.order[results.revealed];
                const next = nextId ? byId.get(nextId) : null;
                const done = left === 0;
                const ranked = standings(players);
                return (
                  <>
                    <div
                      style={{
                        border: `1px solid ${done ? C.accent : C.special}`,
                        background: done ? alpha(C.accent, 8) : alpha(C.special, 8),
                        padding: "18px 20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".26em", color: done ? C.accent : C.special }}>
                        FINAL STANDINGS · {results.revealed} OF {results.order.length} REVEALED
                      </div>
                      {done ? (
                        <div style={{ fontSize: 24, fontWeight: 700 }}>
                          {byId.get(ranked[0]?.id ?? "")?.name ?? "—"} wins with {money(ranked[0]?.score ?? 0)}
                        </div>
                      ) : (
                        <>
                          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".2em", color: C.muted }}>
                            NEXT TO REVEAL
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 26, fontWeight: 700 }}>{next?.name ?? "—"}</div>
                            <div style={{ fontFamily: mono, fontSize: 15, color: C.dim }}>
                              {money(next?.score ?? 0)} · {left === 1 ? "the winner" : `${left} left`}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {!done && (
                        <button
                          onClick={() => send({ type: "revealNextPlace" })}
                          className="tap lift"
                          style={{
                            ...flatBtn,
                            background: `linear-gradient(100deg,${C.special},${C.info})`,
                            color: C.onAccent,
                            border: "none",
                            fontWeight: 600,
                            letterSpacing: ".2em",
                          }}
                        >
                          {left === 1 ? "◆ REVEAL THE WINNER" : "▶ REVEAL NEXT PLACE"}
                        </button>
                      )}
                      <button onClick={() => send({ type: "endResults" })} className="tap" style={flatBtn}>
                        ↩ BACK TO THE BOARD
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {game && !started && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div
                style={{
                  border: `1px solid ${C.line}`,
                  background: C.tile,
                  padding: "18px 20px",
                  display: "flex",
                  gap: 24,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <JoinPanel room={room} size={132} compact />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: C.muted, marginBottom: 6 }}>
                    LOBBY
                  </div>
                  <div style={{ fontSize: 15, color: C.dim, lineHeight: 1.6, maxWidth: "40ch" }}>
                    Players scan the code or open{" "}
                    <span style={{ color: C.accent, fontFamily: mono, fontSize: 13 }}>/play/{room}</span>. The TV is showing
                    the same code, larger.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: C.muted }}>
                    WHO HAS JOINED
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 16, fontWeight: 600, color: C.info }}>{players.length}</div>
                </div>

                {players.length === 0 && (
                  <div
                    style={{
                      border: `1px dashed ${C.line}`,
                      padding: "22px 18px",
                      textAlign: "center",
                      fontFamily: mono,
                      fontSize: 11,
                      letterSpacing: ".18em",
                      color: C.faint,
                      lineHeight: 2,
                    }}
                  >
                    NOBODY YET — YOU CAN START ANYWAY,
                    <br />
                    BUT NOTHING WILL BE SCOREABLE.
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 8 }}>
                  {players.map((p, i) => (
                    <div
                      key={p.id}
                      className="anim-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "11px 13px",
                        background: C.tile,
                        border: `1px solid ${C.line}`,
                        borderLeft: `3px solid ${tintFor(p.tint ?? i)}`,
                        opacity: p.connected ? 1 : 0.5,
                        animationDelay: `${Math.min(i, 8) * 40}ms`,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.name}
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".18em", color: C.mutedDeep }}>
                          {p.connected ? p.cls || "READY" : "AWAY"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => send({ type: "startGame" })}
                className="tap lift"
                style={{
                  padding: "20px",
                  fontFamily: mono,
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: ".24em",
                  color: C.onAccent,
                  background: `linear-gradient(100deg,${C.accent},${C.good})`,
                  border: "none",
                }}
              >
                ▶ START THE GAME
              </button>
            </div>
          )}

          {game?.final && final && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  border: `1px solid ${C.special}`,
                  background: alpha(C.special, 8),
                  padding: "18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".28em", color: C.special }}>
                    FINAL ROUND · {final.phase.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".2em", color: C.accent }}>
                    {game.final.category || "FINAL"}
                  </div>
                </div>

                {final.phase !== "wager" && (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.35 }}>{game.final.t}</div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", borderTop: `1px dashed ${C.edgeSoft}`, paddingTop: 12 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".2em", color: C.dim }}>ANSWER</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: C.info }}>{game.final.a}</div>
                    </div>
                  </>
                )}
                {final.phase === "wager" && (
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: C.faint, lineHeight: 1.9 }}>
                    THE CLUE STAYS HIDDEN UNTIL EVERY WAGER IS IN.
                  </div>
                )}
              </div>

              {final.phase === "reveal" ? (
                (() => {
                  const id = final.order[final.revealIndex];
                  const entry = final.entries[id];
                  const player = byId.get(id);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: C.muted }}>
                        REVEALING {final.revealIndex + 1} OF {final.order.length} — LOWEST SCORE FIRST
                      </div>
                      <div
                        style={{
                          border: `1px solid ${C.line}`,
                          background: C.tile,
                          padding: "18px 20px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 14,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 24, fontWeight: 600 }}>{player?.name ?? "—"}</div>
                          <div style={{ fontFamily: mono, fontSize: 13, color: C.dim }}>HAD {money(player?.score ?? 0)}</div>
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: C.mutedDeep }}>
                          THEY WROTE
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                          {entry?.response.trim() || "— nothing —"}
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: C.mutedDeep }}>
                          THEY WAGERED
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 600, color: C.special }}>
                          {money(entry?.wager ?? 0)}
                        </div>

                        {entry?.judged === null ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => send({ type: "judgeFinal", correct: true })} style={judgeBtn(C.good)}>
                              ✓ CORRECT +{money(entry.wager ?? 0)}
                            </button>
                            <button onClick={() => send({ type: "judgeFinal", correct: false })} style={judgeBtn(C.warn)}>
                              ✕ WRONG −{money(entry.wager ?? 0)}
                            </button>
                          </div>
                        ) : (
                          <div
                            style={{
                              fontFamily: mono,
                              fontSize: 13,
                              letterSpacing: ".2em",
                              color: entry?.judged === "correct" ? C.good : C.warn,
                            }}
                          >
                            RULED {entry?.judged?.toUpperCase()} · NOW ON {money(player?.score ?? 0)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: C.muted }}>
                    {final.phase === "wager"
                      ? "WHO HAS WAGERED"
                      : final.writingClosed
                        ? "PENS DOWN — EVERYTHING IS LOCKED IN"
                        : "WHO HAS ANSWERED"}
                  </div>
                  {final.order.map((id) => {
                    const entry = final.entries[id];
                    const ready = final.phase === "wager" ? entry.wager !== null : entry.response.trim() !== "";
                    return (
                      <div
                        key={id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "11px 14px",
                          background: C.tile,
                          border: `1px solid ${ready ? C.accentDeep : C.line}`,
                        }}
                      >
                        <div style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>{byId.get(id)?.name ?? "—"}</div>
                        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: ready ? C.good : C.faint }}>
                          {ready ? "IN" : "WAITING…"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {final.phase === "clue" && !final.writingClosed && (
                  <button onClick={() => send({ type: "closeFinalWriting" })} className="tap" style={flatBtn}>
                    ✋ PENS DOWN
                  </button>
                )}
                {final.phase !== "done" && (
                  <button
                    onClick={() => send({ type: "finalAdvance" })}
                    style={{ ...flatBtn, background: C.special, color: C.onAccent, border: "none", fontWeight: 600 }}
                  >
                    {final.phase === "wager"
                      ? "▶ SHOW THE CLUE"
                      : final.phase === "clue"
                        ? "▶ START REVEALING"
                        : final.revealIndex < final.order.length - 1
                          ? "▶ NEXT PLAYER"
                          : "▶ FINISH"}
                  </button>
                )}
                <button onClick={() => send({ type: "endFinal" })} style={flatBtn}>
                  {final.phase === "done" ? "↩ BACK TO THE BOARD" : "✕ ABANDON FINAL ROUND"}
                </button>
              </div>
            </div>
          )}

          {game && started && !open && !final && !results && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".24em", color: C.muted }}>
                  PICK A CLUE — IT GOES LIVE ON EVERY SCREEN
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: C.faint }}>
                  WHOSE PICK?
                </div>
                {/* Control is normally won by answering correctly, but a clue
                    nobody got leaves it stale — so the host can hand it over
                    rather than argue about whose turn it is. */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {players.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => send({ type: "setControl", playerId: p.id === control ? null : p.id })}
                      className="tap"
                      style={{
                        padding: "7px 12px",
                        fontFamily: mono,
                        fontSize: 11,
                        letterSpacing: ".1em",
                        fontWeight: 600,
                        color: p.id === control ? C.onAccent : C.dim,
                        background: p.id === control ? C.accent : C.surface,
                        border: `1px solid ${p.id === control ? C.accent : C.edge}`,
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                  {players.length === 0 && (
                    <span style={{ fontFamily: mono, fontSize: 11, color: C.faint }}>—</span>
                  )}
                </div>
              </div>

              {/* Rounds advance by themselves when a board empties; this is for
                  going back, or skipping ahead when a round is being cut for
                  time. */}
              {game.rounds.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: C.muted }}>ROUND</div>
                  {game.rounds.map((r, i) => {
                    const on = i === state.round;
                    const done = totalClues(r) > 0 && used.filter((k) => k.startsWith(`${i}-`)).length >= totalClues(r);
                    return (
                      <button
                        key={r.id ?? i}
                        onClick={() => send({ type: "setRound", index: i })}
                        className="tap"
                        style={{
                          padding: "8px 14px",
                          fontFamily: mono,
                          fontSize: 11,
                          letterSpacing: ".14em",
                          fontWeight: 600,
                          color: on ? C.onAccent : done ? C.faint : C.dim,
                          background: on ? C.accent : C.surface,
                          border: `1px solid ${on ? C.accent : C.edge}`,
                        }}
                      >
                        {r.name || `ROUND ${i + 1}`}
                        {done && !on ? " ✓" : ""}
                      </button>
                    );
                  })}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${board?.categories.length ?? 1}, minmax(0,1fr))`,
                  gap: 6,
                }}
              >
                {board?.categories.map((cat, ci) => (
                  <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: ".05em",
                        textAlign: "center",
                        padding: "8px 4px",
                        borderTop: `2px solid ${C.accent}`,
                        background: C.surfaceDeep,
                        minHeight: 46,
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
                          className={spent ? undefined : "tile"}
                          style={{
                            padding: "14px 0",
                            fontFamily: mono,
                            fontSize: 15,
                            fontWeight: 600,
                            color: spent ? C.edge : C.accent,
                            background: spent ? C.panelDeep : C.surface,
                            border: `1px solid ${spent ? C.lineFaint : C.edge}`,
                          }}
                        >
                          {spent ? "—" : value}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside
          style={{
            borderLeft: `1px solid ${C.lineSoft}`,
            background: C.panelDeep,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".26em", color: C.muted }}>
              STANDINGS · {players.length}
            </div>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {players.length === 0 && (
              <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".16em", color: C.faint, lineHeight: 2 }}>
                NOBODY HAS JOINED.
                <br />
                SEND THEM TO /play/{room}
              </div>
            )}
            {players.map((p, i) => (
              <div
                key={p.id}
                style={{
                  background: C.tile,
                  border: `1px solid ${C.lineFaint}`,
                  borderLeft: `3px solid ${tintFor(p.tint ?? i)}`,
                  padding: "12px 12px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  opacity: p.connected ? 1 : 0.5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.name}
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".18em", color: C.mutedDeep }}>
                      {p.connected ? p.cls || theme.copy.classFallback : "AWAY"}
                    </div>
                  </div>
                  <Score value={p.score} style={{ fontFamily: mono, fontSize: 22, fontWeight: 600 }} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => send({ type: "adjust", playerId: p.id, delta: -100 })} className="tap" style={tinyBtn}>
                    − 100
                  </button>
                  <button onClick={() => send({ type: "adjust", playerId: p.id, delta: 100 })} className="tap" style={tinyBtn}>
                    + 100
                  </button>
                  <button
                    onClick={() => {
                      if (confirmKick === p.id) {
                        send({ type: "kick", playerId: p.id });
                        setConfirmKick("");
                      } else setConfirmKick(p.id);
                    }}
                    onBlur={() => setConfirmKick("")}
                    className="tap"
                    title={`Remove ${p.name} from the room`}
                    style={{
                      ...tinyBtn,
                      flex: confirmKick === p.id ? 2 : 0,
                      padding: "7px 9px",
                      color: confirmKick === p.id ? C.onAccent : C.warn,
                      background: confirmKick === p.id ? C.warn : C.surfaceDeep,
                      borderColor: C.warn,
                    }}
                  >
                    {confirmKick === p.id ? "TAP AGAIN — REMOVES THEM" : "✕"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: `1px solid ${C.lineSoft}`, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {started && !results && (
              <button
                onClick={() => send({ type: "showResults" })}
                className="tap lift"
                style={{
                  ...flatBtn,
                  background: `linear-gradient(100deg,${C.accent},${C.warn})`,
                  color: C.onAccent,
                  border: "none",
                  fontWeight: 600,
                  letterSpacing: ".2em",
                }}
              >
                ★ FINAL STANDINGS
              </button>
            )}
            {started && (
              <button onClick={() => send({ type: "returnToLobby" })} className="tap" style={flatBtn}>
                ↩ BACK TO LOBBY
              </button>
            )}
            <button
              onClick={() => {
                if (confirmClose) {
                  send({ type: "closeRoom" });
                  setConfirmClose(false);
                } else setConfirmClose(true);
              }}
              onBlur={() => setConfirmClose(false)}
              className="tap"
              style={{
                ...flatBtn,
                color: confirmClose ? C.onAccent : C.warn,
                background: confirmClose ? C.warn : C.surface,
                borderColor: C.warn,
              }}
            >
              {confirmClose ? "TAP AGAIN — WIPES THIS ROOM" : "✕ CLOSE ROOM"}
            </button>
            {game?.final && !final && started && (
              <button
                onClick={() => send({ type: "startFinal" })}
                style={{
                  ...flatBtn,
                  background: `linear-gradient(100deg,${C.special},${C.info})`,
                  color: C.onAccent,
                  border: "none",
                  fontWeight: 600,
                  letterSpacing: ".2em",
                }}
              >
                ◆ BEGIN FINAL ROUND
              </button>
            )}
            <button
              onClick={() => send({ type: "setLockout", lockout: lockout === "queue" ? "first-only" : "queue" })}
              style={flatBtn}
            >
              {lockout === "queue" ? "BUZZERS: QUEUE ALL" : "BUZZERS: FIRST ONLY"}
            </button>
            <button
              onClick={() => {
                if (confirmReset) {
                  send({ type: "resetBoard" });
                  setConfirmReset(false);
                } else {
                  setConfirmReset(true);
                }
              }}
              style={{ ...flatBtn, color: confirmReset ? C.warn : C.text, borderColor: confirmReset ? C.warn : C.edge }}
            >
              {confirmReset ? "TAP AGAIN — CLEARS SCORES TOO" : "↺ RESET BOARD"}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

/** Fallback wager entry, for when a player's phone is dead and they call it out. */
function HostWager({ min, max, onLock }: { min: number; max: number; onLock: (wager: number) => void }) {
  const [draft, setDraft] = useState("");
  const parsed = Number(draft.replace(/[^0-9]/g, ""));
  const value = draft.trim() === "" ? min : parsed;
  const clamped = Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && onLock(clamped)}
        inputMode="numeric"
        placeholder="ENTER IT FOR THEM"
        style={{ padding: "10px 12px", fontFamily: mono, fontSize: 14, width: 180 }}
      />
      <button onClick={() => onLock(clamped)} style={{ ...flatBtn, borderColor: C.special, color: C.special }}>
        LOCK IN {money(clamped)}
      </button>
    </div>
  );
}

const flatBtn: React.CSSProperties = {
  padding: "12px 16px",
  fontFamily: mono,
  fontSize: 11,
  letterSpacing: ".16em",
  background: C.surface,
  border: `1px solid ${C.edge}`,
};

const tinyBtn: React.CSSProperties = {
  flex: 1,
  padding: "7px 0",
  fontFamily: mono,
  fontSize: 11,
  background: C.surface,
  border: `1px solid ${C.edgeSoft}`,
};

function judgeBtn(bg: string): React.CSSProperties {
  return {
    padding: "10px 18px",
    fontFamily: mono,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: ".12em",
    color: C.onAccent,
    background: bg,
    border: "none",
  };
}

function Shell({ room, children }: { room: string; children: React.ReactNode }) {
  return (
    <main style={{ height: "100dvh", display: "grid", placeItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: ".24em", color: C.dim }}>{children}</div>
        <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 600, letterSpacing: ".2em", color: C.accent }}>{room}</div>
      </div>
    </main>
  );
}
