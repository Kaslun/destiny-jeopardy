"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { C, mono } from "../lib/theme";
import { loadBoard, myBoards, rememberBoard, saveBoard, type BoardRef } from "../lib/boards";
import { storeEditorName, storedEditorName, useBoard } from "../lib/useBoard";
import {
  applyBoardOp,
  MAX_CATS,
  MIN_CATS,
  newSlug,
  parseGame,
  ROWS,
  type BoardOp,
  type Clue,
  type EditorPresence,
  type Game,
} from "../shared/protocol";

const DRAFT_KEY = "guardian-jeopardy/draft";

function blankGame(): Game {
  return parseGame({
    title: "MY JEOPARDY GAME",
    subtitle: "ROUND 01",
    values: [200, 400, 600, 800, 1000],
    categories: [{ name: "CATEGORY ONE" }, { name: "CATEGORY TWO" }, { name: "CATEGORY THREE" }],
    final: { category: "", t: "", a: "" },
  })!;
}

const isReady = (q: Clue) => !!(q.t.trim() && q.a.trim());
const trunc = (s: string, n: number) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

export default function Editor({ slug }: { slug?: string }) {
  const router = useRouter();
  const [name, setName] = useState("EDITOR");
  const [draft, setDraft] = useState<Game | null>(null);
  const [sel, setSel] = useState({ c: 0, r: 0 });
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [ioText, setIoText] = useState("");
  const [boards, setBoards] = useState<BoardRef[]>([]);
  const [armed, setArmed] = useState("");

  const live = useBoard(slug ?? null, name);
  const collaborative = !!slug;

  useEffect(() => {
    setBoards(myBoards());
    setName(storedEditorName() || "EDITOR");
  }, []);

  // Offline drafts only: restore whatever was last being worked on.
  useEffect(() => {
    if (collaborative) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const parsed = raw ? parseGame(JSON.parse(raw)) : null;
      setDraft(parsed ?? blankGame());
    } catch {
      setDraft(blankGame());
    }
  }, [collaborative]);

  const game = collaborative ? live.game : draft;

  useEffect(() => {
    if (collaborative || !draft) return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* storage unavailable — export still works */
      }
    }, 300);
    return () => clearTimeout(id);
  }, [draft, collaborative]);

  /**
   * Every mutation in this editor is an operation. Collaborative boards send it
   * to the server; local drafts apply the same reducer in memory. One code path,
   * so the two modes cannot drift.
   */
  const emit = useCallback(
    (op: BoardOp) => {
      setArmed("");
      if (collaborative) live.send(op);
      else setDraft((g) => (g ? applyBoardOp(g, op) : g));
    },
    [collaborative, live],
  );

  const selCat = game?.categories[sel.c] ?? null;
  const selCatId = selCat?.id ?? "";

  // Tell the others which cell you're in, so they can steer clear of it.
  useEffect(() => {
    if (!collaborative || !selCatId) return;
    live.setFocus({ catId: selCatId, row: sel.r });
  }, [collaborative, selCatId, sel.r, live]);

  const stats = useMemo(() => {
    if (!game) return { ready: 0, total: 0, pct: 0 };
    const total = game.categories.length * ROWS;
    let ready = 0;
    for (const cat of game.categories) for (const q of cat.clues) if (isReady(q)) ready++;
    return { ready, total, pct: total ? Math.round((ready / total) * 100) : 0 };
  }, [game]);

  const others = live.editors.filter((e) => e.id !== live.you);
  const focusByCell = useMemo(() => {
    const map = new Map<string, EditorPresence[]>();
    for (const e of others) {
      if (!e.focus) continue;
      const key = `${e.focus.catId}:${e.focus.row}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [others]);

  if (!game) {
    return (
      <main style={{ height: "100dvh", display: "grid", placeItems: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: ".24em", color: C.dim }}>
          {live.error ? live.error.toUpperCase() : "LOADING BOARD…"}
        </div>
      </main>
    );
  }

  const selClue = selCat?.clues[sel.r] ?? { t: "", a: "" };
  const media = selClue.media ?? "";
  const finalReady = !!(game.final?.t.trim() && game.final?.a.trim());

  const publish = async () => {
    setBusy(true);
    const target = newSlug();
    try {
      await saveBoard(target, game);
      rememberBoard({ slug: target, title: game.title, savedAt: Date.now() });
      router.replace(`/edit/${target}`);
    } catch (err) {
      setNote({ text: (err as Error).message.toUpperCase(), ok: false });
      setBusy(false);
    }
  };

  const armThen = (key: string, run: () => void) => () => {
    if (armed === key) {
      run();
      setArmed("");
    } else setArmed(key);
  };

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 13,
          padding: "13px 20px",
          borderBottom: `1px solid ${C.lineSoft}`,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: ".1em" }}>BOARD EDITOR</div>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".16em", color: "#7d879c" }}>
          {stats.ready} / {stats.total} READY
        </div>
        <div style={{ width: 130, height: 7, background: "#0f141d", border: `1px solid ${C.line}` }}>
          <div style={{ height: "100%", width: `${stats.pct}%`, background: `linear-gradient(90deg,${C.green},${C.gold})` }} />
        </div>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".14em", color: finalReady ? C.violet : C.faint }}>
          ◆ FINAL {finalReady ? "READY" : "EMPTY"}
        </div>

        <div style={{ flex: 1 }} />

        {collaborative ? (
          <>
            <Presence editors={live.editors} you={live.you} connected={live.connected} />
            <input
              value={name}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().slice(0, 24);
                setName(v);
                storeEditorName(v);
              }}
              style={{ width: 120, padding: "7px 9px", fontFamily: mono, fontSize: 11, letterSpacing: ".12em" }}
            />
            <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".18em", color: C.gold }}>CODE {slug}</div>
          </>
        ) : (
          <button onClick={publish} disabled={busy} style={{ ...btn, background: C.green, color: "#0a0d14", border: "none" }}>
            {busy ? "PUBLISHING…" : "↑ SAVE & SHARE"}
          </button>
        )}
        <button onClick={() => setIoOpen((v) => !v)} style={btn}>
          {ioOpen ? "▲ JSON" : "▼ JSON"}
        </button>
      </header>

      {(note || live.error) && (
        <div
          style={{
            padding: "8px 20px",
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: ".14em",
            color: note?.ok ? C.green : C.orange,
            borderBottom: `1px solid ${C.lineSoft}`,
          }}
        >
          {live.error ? live.error.toUpperCase() : note?.text}
        </div>
      )}

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "292px minmax(0,1fr) 392px", minHeight: 0 }}>
        {/* ---- left ---- */}
        <aside style={aside}>
          <Section label="IDENTITY">
            <Field label="GAME TITLE">
              <Synced value={game.title} onCommit={(v) => emit({ type: "meta", field: "title", value: v })} style={input} />
            </Field>
            <Field label="ROUND LINE">
              <Synced
                value={game.subtitle}
                onCommit={(v) => emit({ type: "meta", field: "subtitle", value: v })}
                style={{ ...input, fontFamily: mono, fontSize: 11, letterSpacing: ".14em" }}
              />
            </Field>
          </Section>

          <Section label="VALUE LADDER">
            {game.values.map((v, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: "#6b7488", width: 22 }}>R{i + 1}</div>
                <Synced
                  value={String(v)}
                  onCommit={(raw) => emit({ type: "value", row: i, value: Number(raw.replace(/[^0-9-]/g, "")) || 0 })}
                  style={{ ...input, flex: 1, fontFamily: mono, fontSize: 13 }}
                />
              </div>
            ))}
          </Section>

          <Section label="FINAL ROUND">
            <Field label="CATEGORY">
              <Synced
                value={game.final?.category ?? ""}
                onCommit={(v) => emit({ type: "final", field: "category", value: v })}
                placeholder="WORLD CAPITALS"
                style={input}
              />
            </Field>
            <Field label="CLUE">
              <Synced
                multiline
                value={game.final?.t ?? ""}
                onCommit={(v) => emit({ type: "final", field: "t", value: v })}
                placeholder="Everyone answers this one at the end."
                style={{ ...input, height: 84, fontSize: 14, lineHeight: 1.45 }}
              />
            </Field>
            <Field label="CORRECT RESPONSE">
              <Synced
                value={game.final?.a ?? ""}
                onCommit={(v) => emit({ type: "final", field: "a", value: v })}
                placeholder="What is …?"
                style={{ ...input, color: C.cyan, fontWeight: 600 }}
              />
            </Field>
          </Section>

          <Section label="BOARD">
            <button
              onClick={armThen("blank", () => emit({ type: "replace", game: blankGame() }))}
              style={{ ...btn, color: armed === "blank" ? C.orange : C.text, borderColor: armed === "blank" ? C.orange : "#26303f" }}
            >
              {armed === "blank" ? "TAP AGAIN — WIPES EVERYTHING" : "✕ BLANK BOARD"}
            </button>
            <a href="/edit" style={{ ...btn, display: "block", textAlign: "center", textDecoration: "none" }}>
              + NEW BOARD
            </a>
          </Section>

          {boards.length > 0 && (
            <Section label="YOUR BOARDS">
              {boards.map((b) => (
                <a
                  key={b.slug}
                  href={`/edit/${b.slug}`}
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "7px 9px",
                    background: b.slug === slug ? "rgba(240,196,105,.1)" : "#0f141d",
                    border: `1px solid ${b.slug === slug ? C.goldDeep : "#1e2635"}`,
                    textDecoration: "none",
                    color: C.text,
                  }}
                >
                  <span style={{ fontFamily: mono, fontSize: 11, color: C.gold }}>{b.slug}</span>
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                </a>
              ))}
            </Section>
          )}
        </aside>

        {/* ---- centre ---- */}
        <section style={{ padding: 16, display: "flex", flexDirection: "column", gap: 11, minWidth: 0, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".2em", color: "#7d879c" }}>
              {collaborative ? "EVERYONE HERE EDITS THE SAME BOARD, LIVE" : "CLICK A CELL TO WRITE IT"}
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => emit({ type: "catAdd" })}
              disabled={game.categories.length >= MAX_CATS}
              style={{ ...btn, background: C.green, color: "#0a0d14", border: "none" }}
            >
              + ADD CATEGORY
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: `repeat(${game.categories.length}, minmax(0,1fr))`,
              gap: 7,
            }}
          >
            {game.categories.map((cat, ci) => (
              <div key={cat.id} style={{ display: "grid", gridTemplateRows: `72px repeat(${ROWS},1fr)`, gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <Synced
                    value={cat.name}
                    onCommit={(v) => emit({ type: "catName", catId: cat.id!, value: v })}
                    placeholder="CATEGORY"
                    style={{ ...input, textAlign: "center", fontWeight: 600, borderTop: `2px solid ${C.gold}` }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => emit({ type: "catMove", catId: cat.id!, dir: -1 })} style={{ ...miniBtn, flex: 1 }}>◀</button>
                    <button onClick={() => emit({ type: "catMove", catId: cat.id!, dir: 1 })} style={{ ...miniBtn, flex: 1 }}>▶</button>
                    <button
                      onClick={() => emit({ type: "catDelete", catId: cat.id! })}
                      disabled={game.categories.length <= MIN_CATS}
                      style={{ ...miniBtn, flex: 1, color: game.categories.length > MIN_CATS ? C.orange : "#2f3a4f" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {cat.clues.map((q, ri) => {
                  const done = isReady(q);
                  const started = !done && !!(q.t.trim() || q.a.trim());
                  const active = ci === sel.c && ri === sel.r;
                  const watchers = focusByCell.get(`${cat.id}:${ri}`) ?? [];
                  return (
                    <button
                      key={q.id ?? ri}
                      onClick={() => setSel({ c: ci, r: ri })}
                      style={{
                        position: "relative",
                        textAlign: "left",
                        padding: "8px 9px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                        overflow: "hidden",
                        background: active ? "rgba(240,196,105,.1)" : done ? C.tile : "#090c13",
                        border: `1px solid ${watchers.length ? watchers[0].color : active ? C.gold : "#1e2635"}`,
                        clipPath: "polygon(0 0,100% 0,100% 84%,93% 100%,0 100%)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%" }}>
                        <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: active ? C.gold : "#6b7488" }}>
                          {game.values[ri]}
                        </span>
                        <span style={{ flex: 1 }} />
                        {watchers.map((w) => (
                          <span
                            key={w.id}
                            title={w.name}
                            style={{ width: 6, height: 6, borderRadius: "50%", background: w.color }}
                          />
                        ))}
                        {q.dd && (
                          <span style={{ fontFamily: mono, fontSize: 8, color: "#0a0d14", background: C.orange, padding: "1px 4px" }}>DD</span>
                        )}
                        {q.media && (
                          <span style={{ fontFamily: mono, fontSize: 8, color: C.cyan, border: `1px solid #1d3d4a`, padding: "1px 4px" }}>
                            {q.media === "video" ? "VID" : "IMG"}
                          </span>
                        )}
                        <span
                          style={{ width: 6, height: 6, transform: "rotate(45deg)", background: done ? C.green : started ? C.orange : "#2f3a4f" }}
                        />
                      </div>
                      <div style={{ fontSize: 11, lineHeight: 1.35, color: q.t.trim() ? "#c9d2e2" : C.faint }}>
                        {q.t.trim() ? trunc(q.t, 58) : "EMPTY"}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {ioOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{ display: "flex", gap: 7 }}>
                <button onClick={() => setIoText(JSON.stringify(game, null, 2))} style={btn}>↑ EXPORT</button>
                <button
                  onClick={() => {
                    try {
                      const parsed = parseGame(JSON.parse(ioText));
                      if (!parsed) throw new Error('needs a non-empty "categories" array');
                      emit({ type: "replace", game: parsed });
                      setNote({ text: "LOADED FROM JSON", ok: true });
                    } catch (err) {
                      setNote({ text: (err as Error).message.toUpperCase(), ok: false });
                    }
                  }}
                  style={{ ...btn, background: C.green, color: "#0a0d14", border: "none" }}
                >
                  ↓ LOAD
                </button>
              </div>
              <textarea
                value={ioText}
                onChange={(e) => setIoText(e.target.value)}
                placeholder="Paste a game here, or hit EXPORT to copy this one out."
                style={{ ...input, height: 110, fontFamily: mono, fontSize: 11, lineHeight: 1.6 }}
              />
            </div>
          )}
        </section>

        {/* ---- right ---- */}
        <aside style={{ ...aside, borderLeft: `1px solid ${C.lineSoft}`, borderRight: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".2em", color: C.gold, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selCat?.name || "UNTITLED"}
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".2em", color: "#9fb0c8" }}>{game.values[sel.r]}</div>
          </div>

          {(() => {
            const watchers = focusByCell.get(`${selCatId}:${sel.r}`) ?? [];
            if (!watchers.length) return null;
            return (
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 10,
                  letterSpacing: ".14em",
                  color: watchers[0].color,
                  border: `1px solid ${watchers[0].color}`,
                  padding: "7px 9px",
                }}
              >
                {watchers.map((w) => w.name).join(", ")} {watchers.length > 1 ? "ARE" : "IS"} IN THIS CLUE TOO
              </div>
            );
          })()}

          <Field label="CLUE · READ ALOUD">
            <Synced
              key={`${selCatId}:${sel.r}:t`}
              multiline
              value={selClue.t}
              onCommit={(v) => emit({ type: "clueText", catId: selCatId, row: sel.r, field: "t", value: v })}
              placeholder="Write it exactly as it should be read out."
              style={{ ...input, height: 140, fontSize: 15, lineHeight: 1.5 }}
            />
          </Field>

          <Field label="CORRECT RESPONSE">
            <Synced
              key={`${selCatId}:${sel.r}:a`}
              value={selClue.a}
              onCommit={(v) => emit({ type: "clueText", catId: selCatId, row: sel.r, field: "a", value: v })}
              placeholder="Who is …?"
              style={{ ...input, fontSize: 16, fontWeight: 600, color: C.cyan }}
            />
          </Field>

          <button
            onClick={() => emit({ type: "clueDD", catId: selCatId, row: sel.r, value: !selClue.dd })}
            style={{
              ...btn,
              padding: "12px",
              fontWeight: 600,
              color: selClue.dd ? "#0a0d14" : C.dim,
              background: selClue.dd ? C.orange : "#141b28",
              borderColor: selClue.dd ? C.orange : "#26303f",
            }}
          >
            {selClue.dd ? "◆ DAILY DOUBLE · ON" : "◇ MAKE THIS A DAILY DOUBLE"}
          </button>

          <Field label="MEDIA ON THE TV">
            <div style={{ display: "flex", gap: 6 }}>
              {([["", "NONE"], ["image", "IMAGE"], ["video", "VIDEO"]] as const).map(([key, label]) => (
                <button
                  key={label}
                  onClick={() => emit({ type: "clueMedia", catId: selCatId, row: sel.r, value: key === "" ? null : key })}
                  style={{
                    ...btn,
                    flex: 1,
                    fontSize: 10,
                    color: media === key ? "#0a0d14" : C.dim,
                    background: media === key ? C.gold : "#141b28",
                    borderColor: media === key ? C.gold : "#26303f",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {media && (
              <Synced
                key={`${selCatId}:${sel.r}:m`}
                value={selClue.mediaLabel ?? ""}
                onCommit={(v) => emit({ type: "clueText", catId: selCatId, row: sel.r, field: "mediaLabel", value: v })}
                placeholder="[ DROP FILE HERE ]"
                style={{ ...input, fontFamily: mono, fontSize: 11, marginTop: 6 }}
              />
            )}
          </Field>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => {
                const n = game.categories.length * ROWS;
                const i = (sel.c * ROWS + sel.r - 1 + n) % n;
                setSel({ c: Math.floor(i / ROWS), r: i % ROWS });
              }}
              style={{ ...btn, flex: 1 }}
            >
              ◀ PREV
            </button>
            <button
              onClick={() => {
                const n = game.categories.length * ROWS;
                const i = (sel.c * ROWS + sel.r + 1) % n;
                setSel({ c: Math.floor(i / ROWS), r: i % ROWS });
              }}
              style={{ ...btn, flex: 1 }}
            >
              NEXT ▶
            </button>
            <button onClick={() => emit({ type: "clueClear", catId: selCatId, row: sel.r })} style={{ ...btn, flex: 1, color: C.orange }}>
              ✕ CLEAR
            </button>
          </div>

          <div
            style={{
              marginTop: "auto",
              fontFamily: mono,
              fontSize: 10,
              letterSpacing: ".13em",
              color: C.faint,
              lineHeight: 1.9,
              borderTop: `1px solid #141b26`,
              paddingTop: 12,
            }}
          >
            {collaborative ? (
              <>
                SAVED CONTINUOUSLY · SHARE THIS PAGE&apos;S URL
                <br />
                TO EDIT TOGETHER. LOAD CODE <span style={{ color: C.gold }}>{slug}</span> IN THE HOST CONSOLE.
              </>
            ) : (
              <>THIS DRAFT IS ONLY IN THIS BROWSER. SAVE &amp; SHARE TO PUT IT ON THE SERVER AND EDIT IT WITH OTHERS.</>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- */

/**
 * A text field backed by a value that other people can change underneath you.
 *
 * While it has focus it keeps its own buffer and ignores incoming values, so a
 * broadcast echo of your own keystrokes cannot fight your cursor. On blur it
 * snaps to whatever the server currently says, which is how you pick up an edit
 * someone else made to the same field while you were in it.
 */
function Synced({
  value,
  onCommit,
  multiline,
  style,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  const common = {
    value: local,
    placeholder,
    style,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      setLocal(latest.current);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setLocal(e.target.value);
      onCommit(e.target.value);
    },
  };

  return multiline ? <textarea {...common} /> : <input {...common} />;
}

function Presence({ editors, you, connected }: { editors: EditorPresence[]; you: string; connected: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".16em", color: connected ? C.green : C.orange }}>
        {connected ? "● LIVE" : "● OFFLINE"}
      </span>
      <div style={{ display: "flex", gap: 4 }}>
        {editors.map((e) => (
          <span
            key={e.id}
            title={e.id === you ? `${e.name} (you)` : e.name}
            style={{
              fontFamily: mono,
              fontSize: 10,
              letterSpacing: ".1em",
              padding: "3px 7px",
              color: "#0a0d14",
              background: e.color,
              opacity: e.id === you ? 0.55 : 1,
            }}
          >
            {e.name}
            {e.id === you ? " (YOU)" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".22em", color: C.faint }}>{label}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".16em", color: "#6b7488" }}>{label}</div>
      {children}
    </div>
  );
}

const aside: React.CSSProperties = {
  background: C.panelDeep,
  borderRight: `1px solid ${C.lineSoft}`,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 18,
  overflow: "auto",
};

const input: React.CSSProperties = { width: "100%", padding: "9px 10px", fontSize: 13 };

const btn: React.CSSProperties = {
  padding: "9px 13px",
  fontFamily: mono,
  fontSize: 11,
  letterSpacing: ".13em",
  background: "#141b28",
  border: "1px solid #2f3a4f",
};

const miniBtn: React.CSSProperties = {
  padding: "4px 0",
  fontFamily: mono,
  fontSize: 10,
  background: "#0f141d",
  border: "1px solid #222b3a",
  color: "#8b95ab",
};
