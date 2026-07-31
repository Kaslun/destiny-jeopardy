"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { alpha, C, mono, newRoomCode } from "../lib/theme";
import { keyFor, linkWithKey } from "../lib/keys";
import { loadBoard, myBoards, rememberBoard, saveBoard, type BoardRef } from "../lib/boards";
import { storeEditorName, storedEditorName, useBoard } from "../lib/useBoard";
import { readJson, writeJson } from "../lib/storage";
import { useTheme } from "../lib/useTheme";
import { DEFAULT_THEME_ID, THEMES } from "../lib/themes";
import { mediaLimitLabel, storageUsage, uploadMedia } from "../lib/media";
import { ClueMedia } from "./ClueMedia";
import {
  applyBoardOp,
  DEFAULT_CLUE_SECONDS,
  DEFAULT_READ_SECONDS,
  MAX_CATS,
  MAX_ROUNDS,
  MIN_CATS,
  newSlug,
  parseGame,
  formatBytes,
  ROWS,
  youTubeId,
  type BoardOp,
  type StorageUsage,
  type Clue,
  type EditorPresence,
  type Game,
} from "../shared/protocol";

function blankGame(): Game {
  return parseGame({
    title: "MY JEOPARDY GAME",
    subtitle: "ROUND 01",
    values: [200, 400, 600, 800, 1000],
    categories: [{ name: "CATEGORY ONE" }, { name: "CATEGORY TWO" }, { name: "CATEGORY THREE" }],
    final: { category: "", t: "", a: "" },
    theme: DEFAULT_THEME_ID,
  })!;
}

/**
 * Whether a clue is finished enough to play.
 *
 * The answer is the one thing every clue needs — without it the host has
 * nothing to rule against. The *question* can be an image or a video instead of
 * text: "what is this?" over a photograph is a complete clue, and requiring
 * words as well marked a whole board of picture rounds as unfinished.
 */
const isReady = (q: Clue) => !!(q.a.trim() && (q.t.trim() || q.media));

/** Started but not finished — worth flagging amber rather than empty. */
const isStarted = (q: Clue) => !isReady(q) && !!(q.t.trim() || q.a.trim() || q.media);
const trunc = (s: string, n: number) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

export default function Editor({ slug }: { slug?: string }) {
  const router = useRouter();
  const [name, setName] = useState("EDITOR");
  const [draft, setDraft] = useState<Game | null>(null);
  /** Which round is being edited, and the cell selected within it. */
  const [sel, setSel] = useState({ round: 0, c: 0, r: 0 });
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [ioText, setIoText] = useState("");
  const [boards, setBoards] = useState<BoardRef[]>([]);
  const [armed, setArmed] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  /** The YouTube URL being pasted for the selected clue. */
  const [youtube, setYoutube] = useState("");
  /** How much of the storage budget this board is using. Null until known. */
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  const live = useBoard(slug ?? null, name);
  const collaborative = !!slug;

  useEffect(() => {
    setBoards(myBoards());
    setName(storedEditorName() || "EDITOR");
  }, []);

  // Only a saved board occupies storage — a local draft has nowhere to put a
  // file yet, so there is nothing to report.
  useEffect(() => {
    if (slug) void storageUsage(slug).then(setUsage);
  }, [slug]);

  // Offline drafts only: restore whatever was last being worked on.
  useEffect(() => {
    if (collaborative) return;
    const saved = readJson<unknown>("draft");
    setDraft((saved ? parseGame(saved) : null) ?? blankGame());
  }, [collaborative]);

  const game = collaborative ? live.game : draft;

  useEffect(() => {
    if (collaborative || !draft) return;
    const id = setTimeout(() => writeJson("draft", draft), 300);
    return () => clearTimeout(id);
  }, [draft, collaborative]);

  // The editor wears the board it is editing, so the theme picker previews
  // itself and every colour on this screen is the one the room will see.
  const theme = useTheme(game?.theme);

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

  // Clamped rather than trusted: a collaborator can delete the round you are
  // looking at, and an index pointing past the end would blank the editor.
  const roundIndex = game ? Math.min(sel.round, game.rounds.length - 1) : 0;
  const selRound = game?.rounds[roundIndex] ?? null;
  const selCat = selRound?.categories[sel.c] ?? null;
  const selCatId = selCat?.id ?? "";

  // Tell the others which cell you're in, so they can steer clear of it.
  useEffect(() => {
    if (!collaborative || !selCatId) return;
    live.setFocus({ catId: selCatId, row: sel.r });
  }, [collaborative, selCatId, sel.r, live]);

  // Counted across every round: the progress bar is about the whole game being
  // ready to play, and a round-local count would read 100% with round two blank.
  const stats = useMemo(() => {
    if (!game) return { ready: 0, total: 0, pct: 0 };
    let total = 0;
    let ready = 0;
    for (const round of game.rounds) {
      total += round.categories.length * ROWS;
      for (const cat of round.categories) for (const q of cat.clues) if (isReady(q)) ready++;
    }
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

  const selClue: Clue = selCat?.clues[sel.r] ?? { t: "", a: "" };
  const media = selClue.media ?? "";
  const boardSeconds = game.timerSeconds ?? DEFAULT_CLUE_SECONDS;
  const boardReadSeconds = game.readSeconds ?? DEFAULT_READ_SECONDS;
  // Same rule as a board clue: an answer, plus either words or something to look at.
  const finalReady = !!(game.final?.a.trim() && (game.final?.t.trim() || game.final?.media));

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

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>, target: "clue" | "final" = "clue") => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again after a failure
    if (!file) return;

    // Uploads are stored under the board's code, so a draft has nowhere to put
    // them yet. Saying so beats a confusing failure.
    if (!slug) {
      setNote({ text: "SAVE & SHARE THIS BOARD FIRST — UPLOADS ARE STORED AGAINST ITS CODE", ok: false });
      return;
    }
    // The final clue has no id of its own, so it gets a fixed one in the key.
    const owner = target === "final" ? "final" : selClue.id;
    if (!owner) return;

    setUploading(true);
    setUploadPct(0);
    try {
      const up = await uploadMedia(slug, owner, file, setUploadPct);
      if (target === "final") emit({ type: "finalMedia", value: up.media, key: up.key });
      else emit({ type: "clueMedia", catId: selCatId, row: sel.r, value: up.media, key: up.key });
      setNote({ text: `UPLOADED ${file.name.toUpperCase()}`, ok: true });
    } catch (err) {
      setNote({ text: (err as Error).message.toUpperCase(), ok: false });
    } finally {
      setUploading(false);
      setUploadPct(0);
      // Refresh after every attempt, successful or not: a failure is often
      // *because* the board is full, which is exactly when the number matters.
      if (slug) void storageUsage(slug).then(setUsage);
    }
  };

  const attachYouTube = () => {
    const id = youTubeId(youtube);
    if (!id) {
      setNote({ text: "THAT DOESN'T LOOK LIKE A YOUTUBE LINK", ok: false });
      return;
    }
    // Stored in `mediaKey` like an upload's object key. Same field, same
    // question on every screen: is there something here, and what do I point at?
    emit({ type: "clueMedia", catId: selCatId, row: sel.r, value: "youtube", key: id });
    setYoutube("");
    setNote({ text: `ATTACHED YOUTUBE ${id}`, ok: true });
  };

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote({ text: message, ok: true });
    } catch {
      // No clipboard permission, or an insecure origin. Showing the link is
      // still useful — it can be selected by hand.
      setNote({ text: text.toUpperCase(), ok: true });
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
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".16em", color: C.muted }}>
          {stats.ready} / {stats.total} READY
        </div>
        <div style={{ width: 130, height: 7, background: C.surfaceDeep, border: `1px solid ${C.line}` }}>
          <div style={{ height: "100%", width: `${stats.pct}%`, background: `linear-gradient(90deg,${C.good},${C.accent})` }} />
        </div>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".14em", color: finalReady ? C.special : C.faint }}>
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
            <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: ".18em", color: C.accent }}>CODE {slug}</div>
            {/* Two different links, because they grant different things: the
                read-only one is for whoever is hosting, the edit one is for a
                co-author. Labelling them apart is the whole safeguard. */}
            <button onClick={() => copy(`${location.origin}/edit/${slug}`, "SHARE LINK COPIED — READ-ONLY")} style={btn}>
              ⧉ LINK
            </button>
            {live.canEdit && (
              <button
                onClick={() =>
                  copy(
                    linkWithKey(`/edit/${slug}`, keyFor("edit-key", slug!)),
                    "EDIT LINK COPIED — ANYONE WITH IT CAN CHANGE THIS BOARD",
                  )
                }
                style={{ ...btn, color: C.accent, borderColor: C.accentDeep }}
              >
                ⧉ EDIT LINK
              </button>
            )}
            <button
              onClick={() => router.push(`/host/${newRoomCode()}?board=${slug}`)}
              className="tap lift"
              style={{ ...btn, background: C.accent, color: C.onAccent, border: "none", fontWeight: 600 }}
            >
              ▶ START A GAME
            </button>
          </>
        ) : (
          <button onClick={publish} disabled={busy} style={{ ...btn, background: C.good, color: C.onAccent, border: "none" }}>
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
            color: note?.ok ? C.good : C.warn,
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

          <Section label="THEME">
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {THEMES.map((t) => {
                const on = t.id === theme.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => emit({ type: "theme", value: t.id })}
                    title={t.blurb}
                    style={{
                      ...btn,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      textAlign: "left",
                      padding: "8px 10px",
                      color: on ? C.accent : C.dim,
                      borderColor: on ? C.accent : C.edgeSoft,
                    }}
                  >
                    {/* Each theme's own accent, not the live one — the point is
                        to see what you are choosing before you choose it. */}
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        flex: "none",
                        background: t.colors.accent,
                        border: `1px solid ${t.colors.edge}`,
                        transform: "rotate(45deg)",
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>{t.name.toUpperCase()}</span>
                    {on && <span style={{ fontSize: 9, color: C.accent }}>●</span>}
                  </button>
                );
              })}
            </div>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".1em", color: C.faint, lineHeight: 1.7 }}>
              {theme.blurb.toUpperCase()}
            </div>
          </Section>

          <Section label={`VALUE LADDER · ${selRound?.name || `ROUND ${roundIndex + 1}`}`}>
            {(selRound?.values ?? []).map((v, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: C.mutedDeep, width: 22 }}>R{i + 1}</div>
                <Synced
                  key={`${roundIndex}:${i}`}
                  value={String(v)}
                  onCommit={(raw) =>
                    emit({
                      type: "value",
                      round: roundIndex,
                      row: i,
                      value: Number(raw.replace(/[^0-9-]/g, "")) || 0,
                    })
                  }
                  style={{ ...input, flex: 1, fontFamily: mono, fontSize: 13 }}
                />
              </div>
            ))}
            {roundIndex > 0 && (
              <button onClick={() => emit({ type: "roundDouble", index: roundIndex })} style={{ ...btn, fontSize: 10 }}>
                ×2 MATCH THE PREVIOUS ROUND, DOUBLED
              </button>
            )}
          </Section>

          <Section label="TIMER">
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.mutedDeep, flex: 1 }}>BOARD DEFAULT</div>
              <Synced
                value={String(boardSeconds)}
                onCommit={(raw) => {
                  const n = Number(raw.replace(/[^0-9]/g, ""));
                  if (n) emit({ type: "boardSeconds", value: n });
                }}
                style={{ ...input, width: 74, fontFamily: mono, fontSize: 13, textAlign: "center" }}
              />
              <span style={{ fontFamily: mono, fontSize: 11, color: C.faint }}>SEC</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: C.mutedDeep, flex: 1 }}>READ DELAY</div>
              <Synced
                value={String(boardReadSeconds)}
                onCommit={(raw) => emit({ type: "boardReadSeconds", value: Number(raw.replace(/[^0-9]/g, "")) || 0 })}
                style={{ ...input, width: 74, fontFamily: mono, fontSize: 13, textAlign: "center" }}
              />
              <span style={{ fontFamily: mono, fontSize: 11, color: C.faint }}>SEC</span>
            </div>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".1em", color: C.faint, lineHeight: 1.8 }}>
              ANY CLUE CAN OVERRIDE BOTH. THE READ DELAY HOLDS
              <br />
              THE BUZZERS SHUT WHILE THE CLUE IS READ OUT.
            </div>
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
                style={{ ...input, color: C.info, fontWeight: 600 }}
              />
            </Field>
            <Field label="TIME TO WRITE">
              <button
                onClick={() => emit({ type: "finalTimerOff", value: !game.final?.timerOff })}
                style={{
                  ...btn,
                  padding: "9px",
                  fontSize: 10,
                  fontWeight: 600,
                  color: game.final?.timerOff ? C.onAccent : C.text,
                  background: game.final?.timerOff ? C.warn : C.surface,
                  borderColor: game.final?.timerOff ? C.warn : C.edge,
                }}
              >
                {game.final?.timerOff ? "⏸ NO TIMER" : "⏱ TIMED"}
              </button>
              {!game.final?.timerOff && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                  <Synced
                    value={game.final?.seconds ? String(game.final.seconds) : ""}
                    onCommit={(raw) => {
                      const n = Number(raw.replace(/[^0-9]/g, ""));
                      emit({ type: "finalSeconds", value: raw.trim() === "" || !n ? null : n });
                    }}
                    placeholder={`${boardSeconds} (BOARD DEFAULT)`}
                    style={{ ...input, flex: 1, fontFamily: mono, fontSize: 12 }}
                  />
                  <span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>SEC</span>
                </div>
              )}
            </Field>

            <Field label="READ DELAY">
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Synced
                  value={game.final?.readSeconds === undefined ? "" : String(game.final.readSeconds)}
                  onCommit={(raw) => {
                    const trimmed = raw.trim();
                    emit({
                      type: "finalReadSeconds",
                      value: trimmed === "" ? null : Number(trimmed.replace(/[^0-9]/g, "")) || 0,
                    });
                  }}
                  placeholder={`${boardReadSeconds} (BOARD DEFAULT)`}
                  style={{ ...input, flex: 1, fontFamily: mono, fontSize: 12 }}
                />
                <span style={{ fontFamily: mono, fontSize: 10, color: C.faint }}>SEC</span>
              </div>
              <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".1em", color: C.faint, marginTop: 4 }}>
                THE WRITING CLOCK STARTS AFTER THIS.
              </div>
            </Field>

            <Field label="MEDIA">
              {game.final?.mediaKey ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <ClueMedia
                    media={game.final.media ?? "image"}
                    mediaKey={game.final.mediaKey}
                    label={game.final.mediaLabel}
                    height={96}
                    border={C.line}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <label style={{ ...btn, flex: 1, textAlign: "center", cursor: "pointer", fontSize: 10 }}>
                      ⟳ REPLACE
                      <input type="file" accept="image/*,video/*,audio/*" hidden onChange={(e) => onPickFile(e, "final")} />
                    </label>
                    <button onClick={() => emit({ type: "finalMedia", value: null })} style={{ ...btn, flex: 1, fontSize: 10, color: C.warn }}>
                      ✕ REMOVE
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  style={{
                    ...btn,
                    textAlign: "center",
                    cursor: uploading ? "progress" : "pointer",
                    borderStyle: "dashed",
                    fontSize: 10,
                    padding: "11px",
                  }}
                >
                  {uploading ? `UPLOADING ${Math.round(uploadPct * 100)}%` : "⬆ IMAGE OR VIDEO"}
                  <input type="file" accept="image/*,video/*,audio/*" hidden disabled={uploading} onChange={(e) => onPickFile(e, "final")} />
                </label>
              )}
            </Field>
          </Section>

          <Section label="BOARD">
            <button
              onClick={armThen("blank", () => emit({ type: "replace", game: blankGame() }))}
              style={{ ...btn, color: armed === "blank" ? C.warn : C.text, borderColor: armed === "blank" ? C.warn : C.edgeSoft }}
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
                    background: b.slug === slug ? alpha(C.accent, 10) : C.surfaceDeep,
                    border: `1px solid ${b.slug === slug ? C.accentDeep : C.lineFaint}`,
                    textDecoration: "none",
                    color: C.text,
                  }}
                >
                  <span style={{ fontFamily: mono, fontSize: 11, color: C.accent }}>{b.slug}</span>
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                </a>
              ))}
            </Section>
          )}
        </aside>

        {/* ---- centre ---- */}
        <section style={{ padding: 16, display: "flex", flexDirection: "column", gap: 11, minWidth: 0, minHeight: 0 }}>
          {/* One tab per round. The rounds are played in this order, so they
              are shown in it — there is no reordering control because moving
              round two in front of round one is not a thing anyone means. */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {game.rounds.map((r, i) => {
              const on = i === roundIndex;
              return (
                <button
                  key={r.id ?? i}
                  onClick={() => setSel({ round: i, c: 0, r: 0 })}
                  className="tap"
                  style={{
                    ...btn,
                    padding: "8px 14px",
                    fontWeight: 600,
                    color: on ? C.onAccent : C.dim,
                    background: on ? C.accent : C.surface,
                    borderColor: on ? C.accent : C.edge,
                  }}
                >
                  {r.name || `ROUND ${i + 1}`}
                </button>
              );
            })}
            {game.rounds.length < MAX_ROUNDS && (
              <button
                onClick={() => {
                  emit({ type: "roundAdd" });
                  setSel({ round: game.rounds.length, c: 0, r: 0 });
                }}
                style={{ ...btn, color: C.good, borderColor: C.edge }}
              >
                + ROUND
              </button>
            )}
            {game.rounds.length > 1 && (
              <button
                onClick={armThen("delround", () => {
                  emit({ type: "roundDelete", index: roundIndex });
                  setSel({ round: Math.max(0, roundIndex - 1), c: 0, r: 0 });
                })}
                style={{
                  ...btn,
                  color: armed === "delround" ? C.onAccent : C.warn,
                  background: armed === "delround" ? C.warn : C.surface,
                  borderColor: C.warn,
                }}
              >
                {armed === "delround" ? "TAP AGAIN — DELETES THIS ROUND" : "✕ ROUND"}
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Synced
              key={`roundname:${roundIndex}`}
              value={selRound?.name ?? ""}
              onCommit={(v) => emit({ type: "roundName", index: roundIndex, value: v })}
              placeholder="ROUND NAME"
              style={{ ...input, width: 190, fontFamily: mono, fontSize: 11, letterSpacing: ".14em" }}
            />
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".2em", color: C.muted }}>
              {collaborative ? "EVERYONE HERE EDITS THE SAME BOARD, LIVE" : "CLICK A CELL TO WRITE IT"}
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => emit({ type: "catAdd", round: roundIndex })}
              disabled={(selRound?.categories.length ?? 0) >= MAX_CATS}
              style={{ ...btn, background: C.good, color: C.onAccent, border: "none" }}
            >
              + ADD CATEGORY
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: `repeat(${selRound?.categories.length ?? 1}, minmax(0,1fr))`,
              gap: 7,
            }}
          >
            {(selRound?.categories ?? []).map((cat, ci) => (
              <div key={cat.id} style={{ display: "grid", gridTemplateRows: `72px repeat(${ROWS},1fr)`, gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <Synced
                    value={cat.name}
                    onCommit={(v) => emit({ type: "catName", catId: cat.id!, value: v })}
                    placeholder="CATEGORY"
                    style={{ ...input, textAlign: "center", fontWeight: 600, borderTop: `2px solid ${C.accent}` }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => emit({ type: "catMove", catId: cat.id!, dir: -1 })} style={{ ...miniBtn, flex: 1 }}>◀</button>
                    <button onClick={() => emit({ type: "catMove", catId: cat.id!, dir: 1 })} style={{ ...miniBtn, flex: 1 }}>▶</button>
                    <button
                      onClick={() => emit({ type: "catDelete", catId: cat.id! })}
                      disabled={(selRound?.categories.length ?? 0) <= MIN_CATS}
                      style={{ ...miniBtn, flex: 1, color: (selRound?.categories.length ?? 0) > MIN_CATS ? C.warn : C.edge }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {cat.clues.map((q, ri) => {
                  const done = isReady(q);
                  const started = isStarted(q);
                  const active = ci === sel.c && ri === sel.r;
                  const watchers = focusByCell.get(`${cat.id}:${ri}`) ?? [];
                  return (
                    <button
                      key={q.id ?? ri}
                      onClick={() => setSel({ round: roundIndex, c: ci, r: ri })}
                      className="tap"
                      style={{
                        position: "relative",
                        textAlign: "left",
                        transition: "background .16s var(--snap), border-color .16s var(--snap), transform .11s var(--snap)",
                        padding: "8px 9px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                        overflow: "hidden",
                        background: active ? alpha(C.accent, 10) : done ? C.tile : C.panelDeep,
                        border: `1px solid ${watchers.length ? watchers[0].color : active ? C.accent : C.lineFaint}`,
                        clipPath: "polygon(0 0,100% 0,100% 84%,93% 100%,0 100%)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%" }}>
                        <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: active ? C.accent : C.mutedDeep }}>
                          {selRound?.values[ri]}
                        </span>
                        <span style={{ flex: 1 }} />
                        {watchers.map((w) => (
                          <span
                            key={w.id}
                            title={w.name}
                            style={{ width: 6, height: 6, borderRadius: "50%", background: w.color }}
                          />
                        ))}
                        {q.timerOff && (
                          <span
                            title="No timer"
                            style={{ fontFamily: mono, fontSize: 9, color: C.warn, border: `1px solid ${C.warn}`, padding: "0 3px", lineHeight: 1.3 }}
                          >
                            ∞
                          </span>
                        )}
                        {!!(q.readSeconds ?? boardReadSeconds) && (
                          <span
                            title={`Buzzers open ${q.readSeconds ?? boardReadSeconds}s after this clue appears`}
                            style={{
                              fontFamily: mono,
                              fontSize: 8,
                              color: C.info,
                              border: `1px solid ${alpha(C.info, 35)}`,
                              padding: "1px 3px",
                              lineHeight: 1.3,
                            }}
                          >
                            ⏸{q.readSeconds ?? boardReadSeconds}
                          </span>
                        )}
                        {q.dd && (
                          <span style={{ fontFamily: mono, fontSize: 8, color: C.onAccent, background: C.warn, padding: "1px 4px" }}>DD</span>
                        )}
                        {q.media && (
                          <span style={{ fontFamily: mono, fontSize: 8, color: C.info, border: `1px solid ${alpha(C.info, 35)}`, padding: "1px 4px" }}>
                            {q.media === "video" ? "VID" : "IMG"}
                          </span>
                        )}
                        <span
                          style={{ width: 6, height: 6, transform: "rotate(45deg)", background: done ? C.good : started ? C.warn : C.edge }}
                        />
                      </div>
                      <div style={{ fontSize: 11, lineHeight: 1.35, color: q.t.trim() || q.media ? C.text : C.faint }}>
                        {/* A media clue with no words is not empty — say what
                            it actually is rather than calling it unwritten. */}
                        {q.t.trim()
                          ? trunc(q.t, 58)
                          : q.media
                            ? q.mediaLabel?.trim() || `[ ${q.media.toUpperCase()} ]`
                            : "EMPTY"}
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
                  style={{ ...btn, background: C.good, color: C.onAccent, border: "none" }}
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
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".2em", color: C.accent, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selCat?.name || "UNTITLED"}
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".2em", color: C.dim }}>{selRound?.values[sel.r]}</div>
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
              style={{ ...input, fontSize: 16, fontWeight: 600, color: C.info }}
            />
          </Field>

          <button
            onClick={() => emit({ type: "clueDD", catId: selCatId, row: sel.r, value: !selClue.dd })}
            style={{
              ...btn,
              padding: "12px",
              fontWeight: 600,
              color: selClue.dd ? C.onAccent : C.dim,
              background: selClue.dd ? C.warn : C.surface,
              borderColor: selClue.dd ? C.warn : C.edgeSoft,
            }}
          >
            {selClue.dd ? "◆ DAILY DOUBLE · ON" : "◇ MAKE THIS A DAILY DOUBLE"}
          </button>

          <Field label="MEDIA ON THE TV">
            {selClue.mediaKey ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <ClueMedia
                  media={selClue.media ?? "image"}
                  mediaKey={selClue.mediaKey}
                  label={selClue.mediaLabel}
                  height={128}
                  border={C.line}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <label style={{ ...btn, flex: 1, textAlign: "center", cursor: "pointer" }}>
                    ⟳ REPLACE
                    <input type="file" accept="image/*,video/*,audio/*" hidden onChange={onPickFile} />
                  </label>
                  <button
                    onClick={() => emit({ type: "clueMedia", catId: selCatId, row: sel.r, value: null })}
                    style={{ ...btn, flex: 1, color: C.warn }}
                  >
                    ✕ REMOVE
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{
                    ...btn,
                    textAlign: "center",
                    cursor: uploading ? "progress" : "pointer",
                    borderStyle: "dashed",
                    borderColor: uploading ? C.accent : C.edge,
                    padding: "14px",
                  }}
                >
                  {uploading ? `UPLOADING ${Math.round(uploadPct * 100)}%` : "⬆ UPLOAD IMAGE, VIDEO OR AUDIO"}
                  <input type="file" accept="image/*,video/*,audio/*" hidden disabled={uploading} onChange={onPickFile} />
                </label>
                {uploading && (
                  <div style={{ height: 4, background: C.surfaceDeep, border: `1px solid ${C.line}` }}>
                    <div style={{ height: "100%", width: `${uploadPct * 100}%`, background: C.accent }} />
                  </div>
                )}

                {/* A YouTube clue stores an id, not a file. It costs no storage,
                    which is the difference between a board of clips being
                    shareable and being a bill. */}
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".12em", color: C.faint, marginTop: 4, lineHeight: 1.8 }}>
                  UP TO {mediaLimitLabel()} PER FILE
                  {usage && (
                    <>
                      {" · "}
                      <span style={{ color: usage.board / usage.boardLimit > 0.8 ? C.warn : C.faint }}>
                        THIS BOARD: {formatBytes(usage.board)} / {formatBytes(usage.boardLimit)}
                      </span>
                    </>
                  )}
                  <br />
                  OR PASTE A YOUTUBE LINK — COSTS NO STORAGE:
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={youtube}
                    onChange={(e) => setYoutube(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && attachYouTube()}
                    placeholder="youtube.com/watch?v=…"
                    style={{ ...input, flex: 1, fontFamily: mono, fontSize: 11 }}
                  />
                  <button
                    onClick={attachYouTube}
                    disabled={!youTubeId(youtube)}
                    style={{ ...btn, fontSize: 10, color: youTubeId(youtube) ? C.accent : C.faint }}
                  >
                    ATTACH
                  </button>
                </div>

                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".12em", color: C.faint, marginTop: 4 }}>
                  OR JUST MARK A PLACEHOLDER:
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {([["", "NONE"], ["image", "IMAGE"], ["video", "VIDEO"], ["audio", "AUDIO"]] as const).map(([key, label]) => (
                    <button
                      key={label}
                      onClick={() => emit({ type: "clueMedia", catId: selCatId, row: sel.r, value: key === "" ? null : key })}
                      style={{
                        ...btn,
                        flex: 1,
                        fontSize: 10,
                        color: media === key ? C.onAccent : C.dim,
                        background: media === key ? C.accent : C.surface,
                        borderColor: media === key ? C.accent : C.edgeSoft,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {media && (
              <Synced
                key={`${selCatId}:${sel.r}:m`}
                value={selClue.mediaLabel ?? ""}
                onCommit={(v) => emit({ type: "clueText", catId: selCatId, row: sel.r, field: "mediaLabel", value: v })}
                placeholder="CAPTION (OPTIONAL)"
                style={{ ...input, fontFamily: mono, fontSize: 11, marginTop: 6 }}
              />
            )}
          </Field>

          <Field label="TIMER">
            <button
              onClick={() => emit({ type: "clueTimerOff", catId: selCatId, row: sel.r, value: !selClue.timerOff })}
              style={{
                ...btn,
                padding: "11px",
                fontWeight: 600,
                color: selClue.timerOff ? C.onAccent : C.text,
                background: selClue.timerOff ? C.warn : C.surface,
                borderColor: selClue.timerOff ? C.warn : C.edge,
              }}
            >
              {selClue.timerOff ? "⏸ NO TIMER ON THIS CLUE" : "⏱ TIMED"}
            </button>

            {!selClue.timerOff && (
              <>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                  <Synced
                    key={`${selCatId}:${sel.r}:secs`}
                    value={selClue.seconds ? String(selClue.seconds) : ""}
                    onCommit={(raw) => {
                      const n = Number(raw.replace(/[^0-9]/g, ""));
                      emit({ type: "clueSeconds", catId: selCatId, row: sel.r, value: raw.trim() === "" || !n ? null : n });
                    }}
                    placeholder={`${boardSeconds} (BOARD DEFAULT)`}
                    style={{ ...input, flex: 1, fontFamily: mono, fontSize: 13 }}
                  />
                  <span style={{ fontFamily: mono, fontSize: 11, color: C.faint }}>SEC</span>
                </div>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".1em", color: C.faint, marginTop: 4 }}>
                  {selClue.seconds
                    ? `THIS CLUE RUNS ${selClue.seconds}s`
                    : `LEAVE EMPTY TO USE THE BOARD DEFAULT (${boardSeconds}s)`}
                </div>
              </>
            )}

            {selClue.timerOff && (
              <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".1em", color: C.warn, marginTop: 4, lineHeight: 1.8 }}>
                BUZZERS STAY OPEN UNTIL THE HOST CLOSES THE CLUE.
              </div>
            )}
          </Field>

          <Field label="READ DELAY BEFORE BUZZERS OPEN">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Synced
                key={`${selCatId}:${sel.r}:read`}
                value={selClue.readSeconds === undefined ? "" : String(selClue.readSeconds)}
                onCommit={(raw) => {
                  const trimmed = raw.trim();
                  emit({
                    type: "clueReadSeconds",
                    catId: selCatId,
                    row: sel.r,
                    // Blank falls back to the board; an explicit 0 does not —
                    // it is how you say "this one opens immediately" on a board
                    // whose default is to wait.
                    value: trimmed === "" ? null : Number(trimmed.replace(/[^0-9]/g, "")) || 0,
                  });
                }}
                placeholder={`${boardReadSeconds} (BOARD DEFAULT)`}
                style={{ ...input, flex: 1, fontFamily: mono, fontSize: 13 }}
              />
              <span style={{ fontFamily: mono, fontSize: 11, color: C.faint }}>SEC</span>
            </div>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".1em", color: C.faint, marginTop: 4, lineHeight: 1.8 }}>
              {selClue.media === "video"
                ? "SET THIS TO THE CLIP'S LENGTH SO NOBODY BUZZES OVER IT."
                : "TIME TO READ THE CLUE OUT BEFORE ANYONE CAN RING IN."}
              <br />
              THE HOST CAN ALWAYS OPEN THE BUZZERS EARLY.
            </div>
          </Field>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => {
                const n = (selRound?.categories.length ?? 1) * ROWS;
                const i = (sel.c * ROWS + sel.r - 1 + n) % n;
                setSel({ round: roundIndex, c: Math.floor(i / ROWS), r: i % ROWS });
              }}
              style={{ ...btn, flex: 1 }}
            >
              ◀ PREV
            </button>
            <button
              onClick={() => {
                const n = (selRound?.categories.length ?? 1) * ROWS;
                const i = (sel.c * ROWS + sel.r + 1) % n;
                setSel({ round: roundIndex, c: Math.floor(i / ROWS), r: i % ROWS });
              }}
              style={{ ...btn, flex: 1 }}
            >
              NEXT ▶
            </button>
            <button onClick={() => emit({ type: "clueClear", catId: selCatId, row: sel.r })} style={{ ...btn, flex: 1, color: C.warn }}>
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
              borderTop: `1px solid ${C.lineSoft}`,
              paddingTop: 12,
            }}
          >
            {collaborative ? (
              <>
                SAVED CONTINUOUSLY · SHARE THIS PAGE&apos;S URL
                <br />
                TO EDIT TOGETHER. LOAD CODE <span style={{ color: C.accent }}>{slug}</span> IN THE HOST CONSOLE.
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
      <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".16em", color: connected ? C.good : C.warn }}>
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
              color: C.onAccent,
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
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".16em", color: C.mutedDeep }}>{label}</div>
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
  background: C.surface,
  border: `1px solid ${C.edge}`,
};

const miniBtn: React.CSSProperties = {
  padding: "4px 0",
  fontFamily: mono,
  fontSize: 10,
  background: C.surfaceDeep,
  border: `1px solid ${C.lineFaint}`,
  color: C.dim,
};
