"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { C, mono, money, tintFor } from "../../../lib/theme";
import { Score } from "../../../components/Score";
import { useRole } from "../../../lib/useRoom";
import { loadBoard } from "../../../lib/boards";
import { mediaUrl } from "../../../lib/media";
import { useCountdown } from "../../../lib/useCountdown";
import { clueKey, parseGame } from "../../../shared/protocol";

export default function HostConsole() {
  const room = String(useParams().room ?? "").toUpperCase();
  const { state, connected, error, send } = useRole(room, "host");
  const [paste, setPaste] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  // The host sits next to the TV, so this screen stays silent unless asked.
  const timer = useCountdown(state?.openedAt ?? null, state?.timerSeconds ?? 20);

  const loadByCode = async () => {
    const slug = code.trim().toUpperCase();
    if (!slug) return;
    try {
      const game = await loadBoard(slug);
      send({ type: "setGame", game });
      setNote({ text: `LOADED BOARD ${slug} · ${game.categories.length} CATEGORIES`, ok: true });
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
    setNote({ text: `LOADED · ${game.categories.length} CATEGORIES`, ok: true });
    setPaste("");
  };

  if (!state) {
    return <Shell room={room}>{connected ? "JOINING ROOM…" : "CONNECTING…"}</Shell>;
  }

  const { game, players, used, open, buzzes, revealed, lockout, phase, dd, control, final } = state;
  const byId = new Map(players.map((p) => [p.id, p]));
  const openClue = open && game ? game.categories[open.c]?.clues[open.r] : null;
  const totalClues = game ? game.categories.length * game.values.length : 0;
  const ddOwner = dd ? (byId.get(dd.playerId) ?? null) : null;
  // On a Daily Double the stake replaces the tile value in every ruling.
  const atStake = dd?.wager ?? (open && game ? game.values[open.r] : 0);

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
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".2em", color: "#7d879c" }}>
          {totalClues - used.length} / {totalClues} CLUES LEFT
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: connected ? C.green : C.orange }}>
          {connected ? "● LIVE" : "● OFFLINE"}
        </div>
        <a href={`/tv/${room}`} target="_blank" style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em" }}>
          OPEN TV ↗
        </a>
        <div
          style={{
            fontFamily: mono,
            fontSize: 14,
            letterSpacing: ".2em",
            color: C.gold,
            border: `1px solid #4a3d1d`,
            padding: "6px 12px",
          }}
        >
          ROOM {room}
        </div>
      </header>

      {error && (
        <div style={{ padding: "10px 22px", fontFamily: mono, fontSize: 12, color: C.orange, letterSpacing: ".14em" }}>
          {error.toUpperCase()}
        </div>
      )}

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", minHeight: 0 }}>
        <section style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          {!game && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".26em", color: "#7d879c" }}>
                LOAD A SAVED BOARD BY ITS CODE
              </div>
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
                    color: C.gold,
                    width: 200,
                  }}
                />
                <button
                  onClick={loadByCode}
                  disabled={!code.trim()}
                  style={{
                    padding: "13px 20px",
                    fontFamily: mono,
                    fontSize: 12,
                    letterSpacing: ".16em",
                    fontWeight: 600,
                    color: "#0a0d14",
                    background: C.gold,
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
                    color: "#0a0d14",
                    background: C.green,
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
                    color: note.ok ? C.green : C.orange,
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
                  background: "linear-gradient(120deg,#101828,#0b1018)",
                  border: `1px solid #2a3244`,
                  borderLeft: `4px solid ${C.gold}`,
                  padding: "20px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".26em", color: C.gold }}>
                    {game.categories[open.c]?.name} · {game.values[open.r]}
                  </div>
                  {openClue.dd && (
                    <div
                      style={{
                        fontFamily: mono,
                        fontSize: 10,
                        letterSpacing: ".2em",
                        color: "#0a0d14",
                        background: C.orange,
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
                      color: timer.expired ? C.orange : timer.remaining <= 5 ? C.gold : "#7d879c",
                    }}
                  >
                    {phase === "wager"
                      ? "—"
                      : !state.timed
                        ? "NO TIMER · CLOSE WHEN READY"
                        : timer.expired
                          ? "TIME UP · BUZZERS CLOSED"
                          : `${timer.remaining}s`}
                  </div>
                </div>
                {openClue.mediaKey && (
                  <div
                    style={{
                      alignSelf: "flex-start",
                      border: `1px solid ${C.line}`,
                      background: "#05070c",
                      maxHeight: 130,
                      overflow: "hidden",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {openClue.media === "video" ? (
                      <video src={mediaUrl(openClue.mediaKey)} controls preload="metadata" style={{ maxHeight: 130 }} />
                    ) : (
                      <img src={mediaUrl(openClue.mediaKey)} alt="" style={{ maxHeight: 130 }} />
                    )}
                  </div>
                )}
                <div style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.35 }}>{openClue.t || "—"}</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    borderTop: `1px dashed #2a3244`,
                    paddingTop: 14,
                  }}
                >
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".2em", color: C.dim }}>ANSWER</div>
                  <div style={{ fontSize: 21, fontWeight: 700, color: C.cyan }}>{openClue.a || "—"}</div>
                </div>
              </div>

              {phase === "wager" && dd && (
                <div
                  style={{
                    border: `1px solid ${C.violet}`,
                    background: "rgba(177,140,240,.08)",
                    padding: "18px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".28em", color: C.violet }}>
                    DAILY DOUBLE · WAITING ON A WAGER
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: "#7d879c" }}>
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
                          color: p.id === dd.playerId ? "#0a0d14" : C.text,
                          background: p.id === dd.playerId ? C.violet : "#141b28",
                          border: `1px solid ${p.id === dd.playerId ? C.violet : "#2f3a4f"}`,
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
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".24em", color: "#7d879c" }}>
                    DAILY DOUBLE — ONLY THIS PLAYER MAY ANSWER
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 16px",
                      background: "rgba(177,140,240,.12)",
                      border: `1px solid ${C.violet}`,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 19, fontWeight: 600, minWidth: 140 }}>{ddOwner?.name ?? "—"}</div>
                    <div style={{ fontFamily: mono, fontSize: 13, color: C.violet, flex: 1 }}>
                      WAGERED {money(dd.wager ?? 0)}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => send({ type: "judge", correct: true })} style={judgeBtn(C.green)}>
                        ✓ CORRECT +{money(atStake)}
                      </button>
                      <button onClick={() => send({ type: "judge", correct: false })} style={judgeBtn(C.orange)}>
                        ✕ WRONG −{money(atStake)}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {phase === "buzz" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".24em", color: "#7d879c" }}>
                  WHO BUZZED — RULE ON THE PLAYER AT THE TOP
                </div>
                {buzzes.length === 0 && (
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
                      border: `1px solid ${i === 0 ? C.goldDeep : C.line}`,
                      flexWrap: "wrap",
                      animationDelay: `${i * 50}ms`,
                      transition: "background .2s var(--snap), border-color .2s var(--snap)",
                    }}
                  >
                    <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 600, color: i === 0 ? C.gold : C.dimmer, width: 22 }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 600, minWidth: 140 }}>
                      {byId.get(b.playerId)?.name ?? "—"}
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 12, color: "#7d879c", flex: 1 }}>
                      {(b.ms / 1000).toFixed(2)}s
                    </div>
                    {i === 0 && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => send({ type: "judge", correct: true })}
                          className="tap lift"
                          style={judgeBtn(C.green)}
                        >
                          ✓ CORRECT +{game.values[open.r]}
                        </button>
                        <button
                          onClick={() => send({ type: "judge", correct: false })}
                          className="tap lift"
                          style={judgeBtn(C.orange)}
                        >
                          ✕ WRONG −{game.values[open.r]}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {phase !== "wager" && (
                  <button onClick={() => send({ type: "reveal", on: !revealed })} style={flatBtn}>
                    {revealed ? "◇ HIDE ANSWER ON TV" : "◆ REVEAL ANSWER ON TV"}
                  </button>
                )}
                <button onClick={() => send({ type: "closeClue" })} style={flatBtn}>
                  ↩ CLOSE (MARKS IT PLAYED)
                </button>
              </div>
            </div>
          )}

          {game?.final && final && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  border: `1px solid ${C.violet}`,
                  background: "rgba(177,140,240,.08)",
                  padding: "18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".28em", color: C.violet }}>
                    FINAL ROUND · {final.phase.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".2em", color: C.gold }}>
                    {game.final.category || "FINAL"}
                  </div>
                </div>

                {final.phase !== "wager" && (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 500, lineHeight: 1.35 }}>{game.final.t}</div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", borderTop: `1px dashed #2a3244`, paddingTop: 12 }}>
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".2em", color: C.dim }}>ANSWER</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: C.cyan }}>{game.final.a}</div>
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
                      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: "#7d879c" }}>
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
                        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: "#6b7488" }}>
                          THEY WROTE
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                          {entry?.response.trim() || "— nothing —"}
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".2em", color: "#6b7488" }}>
                          THEY WAGERED
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 600, color: C.violet }}>
                          {money(entry?.wager ?? 0)}
                        </div>

                        {entry?.judged === null ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => send({ type: "judgeFinal", correct: true })} style={judgeBtn(C.green)}>
                              ✓ CORRECT +{money(entry.wager ?? 0)}
                            </button>
                            <button onClick={() => send({ type: "judgeFinal", correct: false })} style={judgeBtn(C.orange)}>
                              ✕ WRONG −{money(entry.wager ?? 0)}
                            </button>
                          </div>
                        ) : (
                          <div
                            style={{
                              fontFamily: mono,
                              fontSize: 13,
                              letterSpacing: ".2em",
                              color: entry?.judged === "correct" ? C.green : C.orange,
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
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: "#7d879c" }}>
                    {final.phase === "wager" ? "WHO HAS WAGERED" : "WHO HAS ANSWERED"}
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
                          border: `1px solid ${ready ? C.goldDeep : C.line}`,
                        }}
                      >
                        <div style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>{byId.get(id)?.name ?? "—"}</div>
                        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: ready ? C.green : C.faint }}>
                          {ready ? "IN" : "WAITING…"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {final.phase !== "done" && (
                  <button
                    onClick={() => send({ type: "finalAdvance" })}
                    style={{ ...flatBtn, background: C.violet, color: "#0a0d14", border: "none", fontWeight: 600 }}
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

          {game && !open && !final && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
              <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".24em", color: "#7d879c" }}>
                PICK A CLUE — IT GOES LIVE ON EVERY SCREEN
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${game.categories.length}, minmax(0,1fr))`,
                  gap: 6,
                }}
              >
                {game.categories.map((cat, ci) => (
                  <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: ".05em",
                        textAlign: "center",
                        padding: "8px 4px",
                        borderTop: `2px solid ${C.gold}`,
                        background: "#0f141d",
                        minHeight: 46,
                      }}
                    >
                      {cat.name || "—"}
                    </div>
                    {game.values.map((value, ri) => {
                      const spent = used.includes(clueKey(ci, ri));
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
                            color: spent ? "#2f3a4f" : C.gold,
                            background: spent ? "#090c13" : "#141b28",
                            border: `1px solid ${spent ? "#161d29" : "#2f3a4f"}`,
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
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".26em", color: "#7d879c" }}>
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
                  border: `1px solid #1e2635`,
                  borderLeft: `3px solid ${tintFor(i)}`,
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
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".18em", color: "#6b7488" }}>
                      {p.connected ? p.cls || "GUARDIAN" : "AWAY"}
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
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: `1px solid ${C.lineSoft}`, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {game?.final && !final && (
              <button
                onClick={() => send({ type: "startFinal" })}
                style={{
                  ...flatBtn,
                  background: `linear-gradient(100deg,${C.violet},${C.cyan})`,
                  color: "#0a0d14",
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
              style={{ ...flatBtn, color: confirmReset ? C.orange : C.text, borderColor: confirmReset ? C.orange : "#2f3a4f" }}
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
      <button onClick={() => onLock(clamped)} style={{ ...flatBtn, borderColor: C.violet, color: C.violet }}>
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
  background: "#141b28",
  border: "1px solid #2f3a4f",
};

const tinyBtn: React.CSSProperties = {
  flex: 1,
  padding: "7px 0",
  fontFamily: mono,
  fontSize: 11,
  background: "#151c28",
  border: "1px solid #26303f",
};

function judgeBtn(bg: string): React.CSSProperties {
  return {
    padding: "10px 18px",
    fontFamily: mono,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: ".12em",
    color: "#0a0d14",
    background: bg,
    border: "none",
  };
}

function Shell({ room, children }: { room: string; children: React.ReactNode }) {
  return (
    <main style={{ height: "100dvh", display: "grid", placeItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: ".24em", color: C.dim }}>{children}</div>
        <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 600, letterSpacing: ".2em", color: C.gold }}>{room}</div>
      </div>
    </main>
  );
}
