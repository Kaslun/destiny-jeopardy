"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { C, mono } from "../lib/theme";
import { loadBoard, myBoards, rememberBoard, saveBoard, type BoardRef } from "../lib/boards";
import { ROWS, newSlug, parseGame, type Category, type Clue, type Game } from "../shared/protocol";

const DRAFT_KEY = "guardian-jeopardy/draft";
const MIN_CATS = 2;
const MAX_CATS = 8;

function blankClue(): Clue {
  return { t: "", a: "" };
}
function blankCategory(name = ""): Category {
  return { name, clues: Array.from({ length: ROWS }, blankClue) };
}
function blankGame(): Game {
  return {
    title: "MY JEOPARDY GAME",
    subtitle: "ROUND 01",
    roomCode: "",
    values: [200, 400, 600, 800, 1000],
    categories: [blankCategory("CATEGORY ONE"), blankCategory("CATEGORY TWO"), blankCategory("CATEGORY THREE")],
    final: { category: "", t: "", a: "" },
  };
}
function isReady(q: Clue): boolean {
  return !!(q.t.trim() && q.a.trim());
}
function trunc(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export default function Editor({ slug }: { slug?: string }) {
  const router = useRouter();
  const [game, setGame] = useState<Game | null>(null);
  const [sel, setSel] = useState({ c: 0, r: 0 });
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string | null>(slug ?? null);
  const [ioOpen, setIoOpen] = useState(false);
  const [ioText, setIoText] = useState("");
  const [boards, setBoards] = useState<BoardRef[]>([]);
  const [armed, setArmed] = useState("");

  useEffect(() => setBoards(myBoards()), []);

  // Load: a saved board by slug, otherwise the local draft, otherwise blank.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (slug) {
        try {
          const loaded = await loadBoard(slug);
          if (!cancelled) setGame({ final: { category: "", t: "", a: "" }, ...loaded });
        } catch (err) {
          if (!cancelled) {
            setGame(blankGame());
            setNote({ text: (err as Error).message.toUpperCase(), ok: false });
          }
        }
        return;
      }
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        const parsed = raw ? parseGame(JSON.parse(raw)) : null;
        if (!cancelled) setGame(parsed ? { final: { category: "", t: "", a: "" }, ...parsed } : blankGame());
      } catch {
        if (!cancelled) setGame(blankGame());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Autosave the working draft. Unsaved work survives a refresh either way.
  useEffect(() => {
    if (!game) return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(game));
      } catch {
        /* storage unavailable — export still works */
      }
    }, 300);
    return () => clearTimeout(id);
  }, [game]);

  const patch = useCallback((fn: (g: Game) => Game) => {
    setGame((g) => (g ? fn(g) : g));
    setArmed("");
  }, []);

  const patchClue = useCallback(
    (delta: Partial<Clue>) =>
      patch((g) => {
        const categories = g.categories.slice();
        const cat = categories[sel.c];
        if (!cat) return g;
        const clues = cat.clues.slice();
        clues[sel.r] = { ...clues[sel.r], ...delta };
        categories[sel.c] = { ...cat, clues };
        return { ...g, categories };
      }),
    [patch, sel],
  );

  const stats = useMemo(() => {
    if (!game) return { ready: 0, total: 0, pct: 0 };
    const total = game.categories.length * ROWS;
    let ready = 0;
    for (const cat of game.categories) for (const q of cat.clues) if (isReady(q)) ready++;
    return { ready, total, pct: total ? Math.round((ready / total) * 100) : 0 };
  }, [game]);

  if (!game) {
    return (
      <main style={{ height: "100dvh", display: "grid", placeItems: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: ".24em", color: C.dim }}>LOADING BOARD…</div>
      </main>
    );
  }

  const selClue = game.categories[sel.c]?.clues[sel.r] ?? blankClue();
  const media = selClue.media ?? "";
  const finalReady = !!(game.final?.t.trim() && game.final?.a.trim());

  const onSave = async () => {
    setBusy(true);
    const target = savedSlug ?? newSlug();
    try {
      await saveBoard(target, game);
      setSavedSlug(target);
      rememberBoard({ slug: target, title: game.title, savedAt: Date.now() });
      setBoards(myBoards());
      setNote({ text: `SAVED · BOARD CODE ${target}`, ok: true });
      if (!slug) router.replace(`/edit/${target}`);
    } catch (err) {
      setNote({ text: (err as Error).message.toUpperCase(), ok: false });
    } finally {
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
          gap: 14,
          padding: "14px 20px",
          borderBottom: `1px solid ${C.lineSoft}`,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: ".1em" }}>BOARD EDITOR</div>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".18em", color: "#7d879c" }}>
          {stats.ready} / {stats.total} CLUES READY
        </div>
        <div style={{ width: 160, height: 7, background: "#0f141d", border: `1px solid ${C.line}` }}>
          <div style={{ height: "100%", width: `${stats.pct}%`, background: `linear-gradient(90deg,${C.green},${C.gold})` }} />
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: ".16em",
            color: finalReady ? C.violet : C.faint,
          }}
        >
          ◆ FINAL {finalReady ? "READY" : "EMPTY"}
        </div>
        <div style={{ flex: 1 }} />
        {savedSlug && (
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".2em", color: C.gold }}>
            CODE {savedSlug}
          </div>
        )}
        <button onClick={onSave} disabled={busy} style={{ ...btn, background: C.green, color: "#0a0d14", border: "none" }}>
          {busy ? "SAVING…" : savedSlug ? "↑ SAVE CHANGES" : "↑ SAVE TO SERVER"}
        </button>
        <button onClick={() => setIoOpen((v) => !v)} style={btn}>
          {ioOpen ? "▲ HIDE JSON" : "▼ JSON"}
        </button>
      </header>

      {note && (
        <div
          style={{
            padding: "9px 20px",
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: ".14em",
            color: note.ok ? C.green : C.orange,
            borderBottom: `1px solid ${C.lineSoft}`,
          }}
        >
          {note.text}
        </div>
      )}

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "300px minmax(0,1fr) 400px", minHeight: 0 }}>
        {/* ---- left: game setup ---- */}
        <aside
          style={{
            background: C.panelDeep,
            borderRight: `1px solid ${C.lineSoft}`,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 22,
            overflow: "auto",
          }}
        >
          <Section label="IDENTITY">
            <Field label="GAME TITLE">
              <input value={game.title} onChange={(e) => patch((g) => ({ ...g, title: e.target.value }))} style={input} />
            </Field>
            <Field label="ROUND LINE">
              <input
                value={game.subtitle}
                onChange={(e) => patch((g) => ({ ...g, subtitle: e.target.value }))}
                style={{ ...input, fontFamily: mono, fontSize: 11, letterSpacing: ".14em" }}
              />
            </Field>
          </Section>

          <Section label="VALUE LADDER">
            {game.values.map((v, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: "#6b7488", width: 22 }}>R{i + 1}</div>
                <input
                  type="number"
                  value={String(v)}
                  onChange={(e) =>
                    patch((g) => {
                      const values = g.values.slice();
                      values[i] = Number(e.target.value.replace(/[^0-9-]/g, "")) || 0;
                      return { ...g, values };
                    })
                  }
                  style={{ ...input, flex: 1, fontFamily: mono, fontSize: 13 }}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: 6 }}>
              {([["÷2", 0.5], ["×2", 2]] as const).map(([label, m]) => (
                <button
                  key={label}
                  onClick={() => patch((g) => ({ ...g, values: g.values.map((v) => Math.round(v * m)) }))}
                  style={{ ...btn, flex: 1, fontSize: 10 }}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => patch((g) => ({ ...g, values: [200, 400, 600, 800, 1000] }))}
                style={{ ...btn, flex: 1, fontSize: 10 }}
              >
                RESET
              </button>
            </div>
          </Section>

          <Section label="FINAL ROUND">
            <Field label="CATEGORY">
              <input
                value={game.final?.category ?? ""}
                onChange={(e) =>
                  patch((g) => ({ ...g, final: { ...(g.final ?? { category: "", t: "", a: "" }), category: e.target.value } }))
                }
                placeholder="WORLD CAPITALS"
                style={input}
              />
            </Field>
            <Field label="CLUE">
              <textarea
                value={game.final?.t ?? ""}
                onChange={(e) => patch((g) => ({ ...g, final: { ...(g.final ?? { category: "", t: "", a: "" }), t: e.target.value } }))}
                placeholder="Everyone answers this one at the end."
                style={{ ...input, height: 90, fontSize: 14, lineHeight: 1.45 }}
              />
            </Field>
            <Field label="CORRECT RESPONSE">
              <input
                value={game.final?.a ?? ""}
                onChange={(e) => patch((g) => ({ ...g, final: { ...(g.final ?? { category: "", t: "", a: "" }), a: e.target.value } }))}
                placeholder="What is …?"
                style={{ ...input, color: C.cyan, fontWeight: 600 }}
              />
            </Field>
          </Section>

          <Section label="BOARD">
            <button
              onClick={armThen("blank", () => setGame(blankGame()))}
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
                    padding: "8px 10px",
                    background: b.slug === savedSlug ? "rgba(240,196,105,.1)" : "#0f141d",
                    border: `1px solid ${b.slug === savedSlug ? C.goldDeep : "#1e2635"}`,
                    textDecoration: "none",
                    color: C.text,
                  }}
                >
                  <span style={{ fontFamily: mono, fontSize: 11, color: C.gold }}>{b.slug}</span>
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.title}
                  </span>
                </a>
              ))}
            </Section>
          )}
        </aside>

        {/* ---- centre: the grid ---- */}
        <section style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, minWidth: 0, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: "#7d879c" }}>
              CLICK A CELL TO WRITE IT
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={() =>
                patch((g) =>
                  g.categories.length >= MAX_CATS ? g : { ...g, categories: [...g.categories, blankCategory("NEW CATEGORY")] },
                )
              }
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
              gap: 8,
            }}
          >
            {game.categories.map((cat, ci) => (
              <div key={ci} style={{ display: "grid", gridTemplateRows: `76px repeat(${ROWS},1fr)`, gap: 7, minWidth: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <input
                    value={cat.name}
                    onChange={(e) =>
                      patch((g) => {
                        const categories = g.categories.slice();
                        categories[ci] = { ...categories[ci], name: e.target.value };
                        return { ...g, categories };
                      })
                    }
                    placeholder="CATEGORY"
                    style={{ ...input, textAlign: "center", fontWeight: 600, borderTop: `2px solid ${C.gold}` }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    {([["◀", -1], ["▶", 1]] as const).map(([label, d]) => (
                      <button
                        key={label}
                        onClick={() =>
                          patch((g) => {
                            const j = ci + d;
                            if (j < 0 || j >= g.categories.length) return g;
                            const categories = g.categories.slice();
                            [categories[ci], categories[j]] = [categories[j], categories[ci]];
                            return { ...g, categories };
                          })
                        }
                        style={{ ...miniBtn, flex: 1 }}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        patch((g) => {
                          if (g.categories.length <= MIN_CATS) return g;
                          const categories = g.categories.filter((_, k) => k !== ci);
                          setSel((s) => ({ ...s, c: Math.min(s.c, categories.length - 1) }));
                          return { ...g, categories };
                        })
                      }
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
                  return (
                    <button
                      key={ri}
                      onClick={() => setSel({ c: ci, r: ri })}
                      style={{
                        textAlign: "left",
                        padding: "9px 10px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        overflow: "hidden",
                        background: active ? "rgba(240,196,105,.1)" : done ? C.tile : "#090c13",
                        border: `1px solid ${active ? C.gold : "#1e2635"}`,
                        clipPath: "polygon(0 0,100% 0,100% 84%,93% 100%,0 100%)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%" }}>
                        <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, color: active ? C.gold : "#6b7488" }}>
                          {game.values[ri]}
                        </span>
                        <span style={{ flex: 1 }} />
                        {q.dd && (
                          <span style={{ fontFamily: mono, fontSize: 8, color: "#0a0d14", background: C.orange, padding: "2px 4px" }}>
                            DD
                          </span>
                        )}
                        {q.media && (
                          <span style={{ fontFamily: mono, fontSize: 8, color: C.cyan, border: `1px solid #1d3d4a`, padding: "2px 4px" }}>
                            {q.media === "video" ? "VID" : "IMG"}
                          </span>
                        )}
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            transform: "rotate(45deg)",
                            background: done ? C.green : started ? C.orange : "#2f3a4f",
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 11, lineHeight: 1.4, color: q.t.trim() ? "#c9d2e2" : C.faint }}>
                        {q.t.trim() ? trunc(q.t, 64) : "EMPTY"}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {ioOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setIoText(JSON.stringify(game, null, 2))} style={btn}>
                  ↑ EXPORT
                </button>
                <button
                  onClick={() => {
                    try {
                      const parsed = parseGame(JSON.parse(ioText));
                      if (!parsed) throw new Error('needs a non-empty "categories" array');
                      setGame({ final: { category: "", t: "", a: "" }, ...parsed });
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
                style={{ ...input, height: 130, fontFamily: mono, fontSize: 11, lineHeight: 1.6 }}
              />
            </div>
          )}
        </section>

        {/* ---- right: clue inspector ---- */}
        <aside
          style={{
            background: C.panelDeep,
            borderLeft: `1px solid ${C.lineSoft}`,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 18,
            overflow: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: C.gold, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {game.categories[sel.c]?.name || "UNTITLED"}
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".22em", color: "#9fb0c8" }}>{game.values[sel.r]}</div>
          </div>

          <Field label="CLUE · READ ALOUD">
            <textarea
              value={selClue.t}
              onChange={(e) => patchClue({ t: e.target.value })}
              placeholder="Write it exactly as it should be read out."
              style={{ ...input, height: 150, fontSize: 15, lineHeight: 1.5 }}
            />
          </Field>

          <Field label="CORRECT RESPONSE">
            <input
              value={selClue.a}
              onChange={(e) => patchClue({ a: e.target.value })}
              placeholder="Who is …?"
              style={{ ...input, fontSize: 16, fontWeight: 600, color: C.cyan }}
            />
          </Field>

          <button
            onClick={() => patchClue({ dd: !selClue.dd })}
            style={{
              ...btn,
              padding: "13px",
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
                  onClick={() => patchClue({ media: key === "" ? undefined : key, mediaLabel: selClue.mediaLabel ?? "" })}
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
              <input
                value={selClue.mediaLabel ?? ""}
                onChange={(e) => patchClue({ mediaLabel: e.target.value })}
                placeholder="[ DROP FILE HERE ]"
                style={{ ...input, fontFamily: mono, fontSize: 11, marginTop: 7 }}
              />
            )}
          </Field>

          <div style={{ display: "flex", gap: 7 }}>
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
            <button
              onClick={() => patchClue({ t: "", a: "", dd: undefined, media: undefined, mediaLabel: undefined })}
              style={{ ...btn, flex: 1, color: C.orange }}
            >
              ✕ CLEAR
            </button>
          </div>

          {savedSlug && (
            <div
              style={{
                marginTop: "auto",
                fontFamily: mono,
                fontSize: 10,
                letterSpacing: ".14em",
                color: C.faint,
                lineHeight: 2,
                borderTop: `1px solid #141b26`,
                paddingTop: 14,
              }}
            >
              TO PLAY THIS: OPEN THE HOST CONSOLE
              <br />
              AND LOAD BOARD CODE <span style={{ color: C.gold }}>{savedSlug}</span>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".24em", color: C.faint }}>{label}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".18em", color: "#6b7488" }}>{label}</div>
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 11px",
  fontSize: 14,
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  fontFamily: mono,
  fontSize: 11,
  letterSpacing: ".14em",
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
