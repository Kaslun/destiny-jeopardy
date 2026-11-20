"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { alpha, C, CELL, newRoomCode } from "../lib/theme";
import { keyFor, linkWithKey } from "../lib/keys";
import { myBoards, rememberBoard, saveBoard } from "../lib/boards";
import { storeEditorName, storedEditorName, useBoard } from "../lib/useBoard";
import { readJson, writeJson } from "../lib/storage";
import { useTheme } from "../lib/useTheme";
import { DEFAULT_THEME_ID } from "../lib/themes";
import { mediaLimitLabel, storageUsage, uploadMedia } from "../lib/media";
import { ClueMedia } from "./ClueMedia";
import { StylePanel } from "./StylePanel";
import {
  ConfirmButton,
  copyText,
  Drawer,
  Field,
  Icon,
  LiveDot,
  Mark,
  Popover,
  Splash,
  SwitchRow,
  useToast,
  type IconName,
} from "./ui";
import {
  applyBoardOp,
  DEFAULT_CLUE_SECONDS,
  DEFAULT_READ_SECONDS,
  formatBytes,
  MAX_CATS,
  MAX_ROUNDS,
  MIN_CATS,
  newSlug,
  parseGame,
  ROWS,
  youTubeId,
  type BoardOp,
  type Clue,
  type EditorPresence,
  type FinalClue,
  type Game,
  type Media,
  type StorageUsage,
} from "../shared/protocol";

function blankGame(): Game {
  return parseGame({
    title: "My quiz",
    subtitle: "",
    rounds: [
      {
        name: "Round 1",
        values: [200, 400, 600, 800, 1000],
        categories: [{ name: "Category 1" }, { name: "Category 2" }, { name: "Category 3" }, { name: "Category 4" }],
      },
    ],
    final: { category: "", t: "", a: "" },
    theme: DEFAULT_THEME_ID,
  })!;
}

/** Playable: an answer, plus either words or something to look at. */
const isReady = (q: { t: string; a: string; media?: Media }) => !!(q.a.trim() && (q.t.trim() || q.media));
const isStarted = (q: Clue) => !isReady(q) && !!(q.t.trim() || q.a.trim() || q.media);

const MEDIA_ICON: Record<Media, IconName> = { image: "image", video: "video", audio: "music", youtube: "youtube" };

type Tab = number | "final";

export default function Editor({ slug }: { slug?: string }) {
  const router = useRouter();
  const [toast, notify] = useToast();
  const [name, setName] = useState("Guest");
  const [draft, setDraft] = useState<Game | null>(null);
  const [tab, setTab] = useState<Tab>(0);
  const [sel, setSel] = useState({ c: 0, r: 0 });
  const [styleOpen, setStyleOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  /** Only true when creating the board on the server failed. */
  const [offline, setOffline] = useState(false);
  const clueRef = useRef<HTMLTextAreaElement>(null);

  const live = useBoard(slug ?? null, name);
  const collaborative = !!slug;

  useEffect(() => setName(storedEditorName() || "Guest"), []);

  useEffect(() => {
    if (slug) void storageUsage(slug).then(setUsage);
  }, [slug]);

  /**
   * `/edit` with no code makes a real, saved board straight away and moves to
   * it. There is no "draft, then publish" step to understand: the quiz exists,
   * has a code, can take uploads and be shared from the first second. Only if
   * the server cannot be reached does it fall back to a local draft.
   */
  const creating = useRef(false);
  useEffect(() => {
    if (slug || creating.current) return;
    creating.current = true;
    const saved = readJson<unknown>("draft");
    const start = (saved ? parseGame(saved) : null) ?? blankGame();
    const target = newSlug();
    saveBoard(target, start)
      .then(() => {
        rememberBoard({ slug: target, title: start.title, savedAt: Date.now() });
        writeJson("draft", null);
        router.replace(`/edit/${target}`);
      })
      .catch(() => {
        setDraft(start);
        setOffline(true);
      });
  }, [slug, router]);

  const game = collaborative ? live.game : draft;

  useEffect(() => {
    if (collaborative || !draft) return;
    const id = setTimeout(() => writeJson("draft", draft), 300);
    return () => clearTimeout(id);
  }, [draft, collaborative]);

  // Keep the local index's title fresh, so "Your quizzes" reads right.
  const title = game?.title;
  useEffect(() => {
    if (!slug || title === undefined) return;
    const known = myBoards().find((b) => b.slug === slug);
    if (live.canEdit && (!known || known.title !== title)) rememberBoard({ slug, title, savedAt: Date.now() });
  }, [slug, title, live.canEdit]);

  // The editor wears the board it is editing: every colour here is the room's.
  const theme = useTheme(game ? game.theme : DEFAULT_THEME_ID, game?.style);

  const emit = useCallback(
    (op: BoardOp) => {
      if (collaborative) live.send(op);
      else setDraft((g) => (g ? applyBoardOp(g, op) : g));
    },
    [collaborative, live],
  );

  // Clamped: a collaborator can delete the round you are looking at.
  const roundIndex = game && tab !== "final" ? Math.min(tab, game.rounds.length - 1) : 0;
  const round = game?.rounds[roundIndex] ?? null;
  const cat = round?.categories[Math.min(sel.c, round.categories.length - 1)] ?? null;
  const catId = cat?.id ?? "";

  useEffect(() => {
    if (!collaborative || !catId || tab === "final") return;
    live.setFocus({ catId, row: sel.r });
  }, [collaborative, catId, sel.r, live, tab]);

  const stats = useMemo(() => {
    if (!game) return { ready: 0, total: 0 };
    let total = 0;
    let ready = 0;
    for (const r of game.rounds) {
      total += r.categories.length * ROWS;
      for (const c of r.categories) for (const q of c.clues) if (isReady(q)) ready++;
    }
    return { ready, total };
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

  // Arrow keys walk the grid whenever you are not typing.
  useEffect(() => {
    if (tab === "final" || !round) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const cols = round.categories.length;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (moves[e.key]) {
        e.preventDefault();
        const [dc, dr] = moves[e.key];
        setSel((s) => ({ c: (s.c + dc + cols) % cols, r: (s.r + dr + ROWS) % ROWS }));
      } else if (e.key === "Enter") {
        e.preventDefault();
        clueRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tab, round]);

  if (!slug && !offline) return <Splash>Creating your quiz…</Splash>;
  if (!game) {
    return (
      <Splash sub={live.error ? <a href="/">Back home</a> : undefined}>{live.error ? capitalise(live.error) : "Loading quiz…"}</Splash>
    );
  }

  const boardSeconds = game.timerSeconds ?? DEFAULT_CLUE_SECONDS;
  const boardRead = game.readSeconds ?? DEFAULT_READ_SECONDS;
  const finalReady = !!game.final && isReady(game.final);
  const clue: Clue = cat?.clues[sel.r] ?? { t: "", a: "" };

  /** Jump to the next clue that still needs writing. */
  const nextEmpty = () => {
    const cells: { round: number; c: number; r: number }[] = [];
    game.rounds.forEach((rd, ri) =>
      rd.categories.forEach((ct, ci) => ct.clues.forEach((q, qi) => !isReady(q) && cells.push({ round: ri, c: ci, r: qi }))),
    );
    if (!cells.length) {
      if (!finalReady) setTab("final");
      else notify("Every clue is ready to play");
      return;
    }
    const here = tab === "final" ? -1 : roundIndex * 1000 + sel.c * 10 + sel.r;
    const next = cells.find((x) => x.round * 1000 + x.c * 10 + x.r > here) ?? cells[0];
    setTab(next.round);
    setSel({ c: next.c, r: next.r });
    setTimeout(() => clueRef.current?.focus(), 30);
  };

  const upload = async (file: File, target: "clue" | "final") => {
    if (!slug) {
      notify("Uploads need the room server — reconnect and try again", "error");
      return;
    }
    const owner = target === "final" ? "final" : clue.id;
    if (!owner) return;
    setUploading(true);
    setUploadPct(0);
    try {
      const up = await uploadMedia(slug, owner, file, setUploadPct);
      if (target === "final") emit({ type: "finalMedia", value: up.media, key: up.key });
      else emit({ type: "clueMedia", catId, row: sel.r, value: up.media, key: up.key });
      notify("Uploaded");
    } catch (err) {
      notify(capitalise((err as Error).message), "error");
    } finally {
      setUploading(false);
      setUploadPct(0);
      void storageUsage(slug).then(setUsage);
    }
  };

  const retrySave = async () => {
    const target = newSlug();
    try {
      await saveBoard(target, game);
      rememberBoard({ slug: target, title: game.title, savedAt: Date.now() });
      writeJson("draft", null);
      router.replace(`/edit/${target}`);
    } catch (err) {
      notify(capitalise((err as Error).message), "error");
    }
  };

  const mediaProps = {
    uploading,
    pct: uploadPct,
    usage,
    onError: (m: string) => notify(m, "error"),
  };

  return (
    <main style={{ height: "100dvh", display: "flex", flexDirection: "column", background: C.bg }}>
      {/* ---------------- header ---------------- */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: `1px solid ${C.lineSoft}`,
          background: C.panelDeep,
          flexWrap: "wrap",
        }}
      >
        <a href="/" className="btn btn-ghost btn-icon" aria-label="Home" title="Home">
          <Icon name="arrowLeft" />
        </a>
        <Mark mark={theme.mark} size={30} />
        <Synced
          value={game.title}
          onCommit={(v) => emit({ type: "meta", field: "title", value: v })}
          placeholder="Quiz title"
          className="input input-ghost display"
          style={{ flex: "1 1 180px", maxWidth: 380, height: 40, fontSize: 20, padding: "0 8px" }}
          ariaLabel="Quiz title"
        />
        <button className="chip tap" onClick={nextEmpty} title="Jump to the next unfinished clue" style={{ height: 30 }}>
          <Ring value={stats.total ? stats.ready / stats.total : 0} />
          <span className="num">
            {stats.ready}/{stats.total}
          </span>
          <span className="hide-sm">ready</span>
        </button>

        <div style={{ flex: 1 }} />

        {collaborative && <Presence editors={live.editors} you={live.you} />}
        {collaborative && <LiveDot connected={live.connected} />}

        <button className="btn" onClick={() => setStyleOpen(true)}>
          <Icon name="palette" /> <span className="hide-sm">Style</span>
        </button>

        {collaborative ? (
          <>
            <Popover
              width={320}
              trigger={({ toggle }) => (
                <button className="btn" onClick={toggle}>
                  <Icon name="share" /> <span className="hide-sm">Share</span>
                </button>
              )}
            >
              {() => (
                <SharePanel
                  slug={slug!}
                  canEdit={live.canEdit}
                  name={name}
                  onName={(v) => {
                    setName(v);
                    storeEditorName(v);
                  }}
                  notify={notify}
                />
              )}
            </Popover>
            <button className="btn btn-primary" onClick={() => router.push(`/host/${newRoomCode()}?board=${slug}`)}>
              <Icon name="play" size={14} /> Play
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={retrySave}>
            <Icon name="upload" size={16} /> Save
          </button>
        )}

        <button className="btn btn-ghost btn-icon" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings">
          <Icon name="settings" />
        </button>
      </header>

      {offline && (
        <Banner tone="warn" icon="wifiOff">
          Can&apos;t reach the server, so this quiz is only saved in this browser. Press Save once you&apos;re back online.
        </Banner>
      )}
      {collaborative && !live.canEdit && (
        <Banner tone="info" icon="eye">
          View only. Ask the owner for the edit link to make changes.
        </Banner>
      )}

      {/* ---------------- tabs ---------------- */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "8px 12px",
          borderBottom: `1px solid ${C.lineSoft}`,
          overflowX: "auto",
        }}
      >
        {game.rounds.map((r, i) => (
          <TabButton key={r.id ?? i} on={tab === i} onClick={() => setTab(i)}>
            {r.name || `Round ${i + 1}`}
          </TabButton>
        ))}
        {game.rounds.length < MAX_ROUNDS && (
          <button
            className="btn btn-ghost btn-sm btn-icon"
            title="Add a round (values doubled)"
            aria-label="Add round"
            onClick={() => {
              emit({ type: "roundAdd" });
              setTab(game.rounds.length);
              setSel({ c: 0, r: 0 });
            }}
          >
            <Icon name="plus" size={16} />
          </button>
        )}
        <div style={{ width: 1, height: 20, background: C.line, margin: "0 6px" }} />
        <TabButton on={tab === "final"} onClick={() => setTab("final")} color={C.special}>
          <span className="dot" style={{ background: finalReady ? C.good : C.edge }} />
          Final
        </TabButton>
        <div style={{ flex: 1 }} />
        {tab !== "final" && (
          <button
            className="btn btn-sm"
            onClick={() => emit({ type: "catAdd", round: roundIndex })}
            disabled={(round?.categories.length ?? 0) >= MAX_CATS}
          >
            <Icon name="plus" size={15} /> Category
          </button>
        )}
      </nav>

      {/* ---------------- body ---------------- */}
      {tab === "final" ? (
        <div className="scroll" style={{ flex: 1, minHeight: 0, padding: "24px 16px 48px" }}>
          <FinalEditor
            final={game.final}
            boardSeconds={boardSeconds}
            boardRead={boardRead}
            emit={emit}
            onUpload={(f) => upload(f, "final")}
            {...mediaProps}
          />
        </div>
      ) : (
        <div className="editor-body" style={{ flex: 1, minHeight: 0 }}>
          <section className="scroll" style={{ padding: 12, minWidth: 0, minHeight: 0 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `52px repeat(${round?.categories.length ?? 1}, minmax(128px,1fr))`,
                gridTemplateRows: `auto repeat(${ROWS}, minmax(84px,1fr))`,
                gap: 6,
                height: "100%",
                minHeight: 520,
              }}
            >
              <div />
              {round?.categories.map((ct, ci) => (
                <CategoryHeader
                  key={ct.id}
                  name={ct.name}
                  canDelete={round.categories.length > MIN_CATS}
                  first={ci === 0}
                  last={ci === round.categories.length - 1}
                  onName={(v) => emit({ type: "catName", catId: ct.id!, value: v })}
                  onMove={(dir) => emit({ type: "catMove", catId: ct.id!, dir })}
                  onDelete={() => emit({ type: "catDelete", catId: ct.id! })}
                />
              ))}
              {Array.from({ length: ROWS }, (_, ri) => (
                <RowCells
                  key={ri}
                  ri={ri}
                  value={round?.values[ri] ?? 0}
                  roundIndex={roundIndex}
                  emit={emit}
                  cells={(round?.categories ?? []).map((ct, ci) => {
                    const q = ct.clues[ri];
                    return (
                      <Cell
                        key={q.id ?? `${ci}-${ri}`}
                        clue={q}
                        value={round!.values[ri]}
                        active={ci === sel.c && ri === sel.r}
                        watchers={focusByCell.get(`${ct.id}:${ri}`) ?? []}
                        onClick={() => setSel({ c: ci, r: ri })}
                      />
                    );
                  })}
                />
              ))}
            </div>
          </section>

          <aside
            className="scroll editor-inspector"
            style={{
              borderLeft: `1px solid ${C.lineSoft}`,
              background: C.panelDeep,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="truncate" style={{ fontSize: 13, color: C.muted }}>
                  {cat?.name || "Untitled category"}
                </div>
                <div className="display num" style={{ fontSize: 24, color: C.accent }}>
                  {round?.values[sel.r]}
                </div>
              </div>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                aria-label="Previous clue"
                onClick={() => {
                  const n = (round?.categories.length ?? 1) * ROWS;
                  const i = (sel.c * ROWS + sel.r - 1 + n) % n;
                  setSel({ c: Math.floor(i / ROWS), r: i % ROWS });
                }}
              >
                <Icon name="chevronLeft" />
              </button>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                aria-label="Next clue"
                onClick={() => {
                  const n = (round?.categories.length ?? 1) * ROWS;
                  const i = (sel.c * ROWS + sel.r + 1) % n;
                  setSel({ c: Math.floor(i / ROWS), r: i % ROWS });
                }}
              >
                <Icon name="chevronRight" />
              </button>
            </div>

            {(() => {
              const w = focusByCell.get(`${catId}:${sel.r}`) ?? [];
              if (!w.length) return null;
              return (
                <div className="chip" style={{ color: C.onAccent, background: w[0].color, alignSelf: "flex-start" }}>
                  {w.map((x) => x.name).join(", ")} {w.length > 1 ? "are" : "is"} here too
                </div>
              );
            })()}

            <Field label="Clue">
              <Synced
                key={`${catId}:${sel.r}:t`}
                multiline
                inputRef={clueRef}
                value={clue.t}
                onCommit={(v) => emit({ type: "clueText", catId, row: sel.r, field: "t", value: v })}
                placeholder="What the host reads out"
                className="input"
                style={{ height: 120, fontSize: 16 }}
              />
            </Field>

            <Field label="Answer">
              <Synced
                key={`${catId}:${sel.r}:a`}
                value={clue.a}
                onCommit={(v) => emit({ type: "clueText", catId, row: sel.r, field: "a", value: v })}
                placeholder="What is…?"
                className="input"
                style={{ fontWeight: 600, color: C.info }}
              />
            </Field>

            <MediaPicker
              key={`${catId}:${sel.r}:m`}
              media={clue.media}
              mediaKey={clue.mediaKey}
              mediaLabel={clue.mediaLabel}
              onUpload={(f) => upload(f, "clue")}
              onYouTube={(id) => emit({ type: "clueMedia", catId, row: sel.r, value: "youtube", key: id })}
              onRemove={() => emit({ type: "clueMedia", catId, row: sel.r, value: null })}
              onCaption={(v) => emit({ type: "clueText", catId, row: sel.r, field: "mediaLabel", value: v })}
              {...mediaProps}
            />

            <SwitchRow
              icon="zap"
              label="Daily Double"
              hint="One player wagers on it alone"
              checked={!!clue.dd}
              onChange={(v) => emit({ type: "clueDD", catId, row: sel.r, value: v })}
            />

            <Timing
              key={`${catId}:${sel.r}:time`}
              timerOff={!!clue.timerOff}
              seconds={clue.seconds}
              readSeconds={clue.readSeconds}
              boardSeconds={boardSeconds}
              boardRead={boardRead}
              isVideo={clue.media === "video" || clue.media === "youtube"}
              onTimerOff={(v) => emit({ type: "clueTimerOff", catId, row: sel.r, value: v })}
              onSeconds={(v) => emit({ type: "clueSeconds", catId, row: sel.r, value: v })}
              onRead={(v) => emit({ type: "clueReadSeconds", catId, row: sel.r, value: v })}
            />

            <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
              <ConfirmButton
                className="btn btn-ghost btn-sm btn-danger"
                confirmLabel="Tap again to clear"
                onConfirm={() => emit({ type: "clueClear", catId, row: sel.r })}
              >
                <Icon name="trash" size={15} /> Clear clue
              </ConfirmButton>
            </div>
          </aside>
        </div>
      )}

      <StylePanel
        open={styleOpen}
        onClose={() => setStyleOpen(false)}
        theme={theme}
        presetId={theme.presetId}
        style={game.style ?? {}}
        onPreset={(id) => {
          emit({ type: "theme", value: id });
          emit({ type: "style", value: null });
        }}
        onStyle={(value) => emit({ type: "style", value })}
      />

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        game={game}
        roundIndex={tab === "final" ? null : roundIndex}
        emit={emit}
        notify={notify}
        onRoundDeleted={() => {
          setTab(Math.max(0, roundIndex - 1));
          setSettingsOpen(false);
        }}
        onBlank={() => emit({ type: "replace", game: { ...blankGame(), theme: game.theme, style: game.style } })}
      />

      {toast}
    </main>
  );
}

/* ================================================================ */

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * A text field backed by a value other people can change underneath you.
 * While focused it keeps its own buffer, so an echo of your own keystrokes
 * cannot fight the cursor; on blur it snaps to whatever the server says.
 */
function Synced({
  value,
  onCommit,
  multiline,
  style,
  className,
  placeholder,
  inputRef,
  ariaLabel,
}: {
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  style?: React.CSSProperties;
  className?: string;
  placeholder?: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  ariaLabel?: string;
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
    className,
    "aria-label": ariaLabel,
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

  return multiline ? <textarea ref={inputRef} {...common} /> : <input {...common} />;
}

/** A small progress ring for the readiness chip. */
function Ring({ value }: { value: number }) {
  const r = 7;
  const len = 2 * Math.PI * r;
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden>
      <circle cx={9} cy={9} r={r} fill="none" stroke={C.line} strokeWidth={2.5} />
      <circle
        cx={9}
        cy={9}
        r={r}
        fill="none"
        stroke={value >= 1 ? C.good : C.accent}
        strokeWidth={2.5}
        strokeDasharray={`${len * value} ${len}`}
        strokeLinecap="round"
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

function Banner({ tone, icon, children }: { tone: "warn" | "info"; icon: IconName; children: React.ReactNode }) {
  const color = tone === "warn" ? C.warn : C.info;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        fontSize: 14,
        color,
        background: alpha(color, 10),
        borderBottom: `1px solid ${alpha(color, 30)}`,
      }}
    >
      <Icon name={icon} size={16} />
      <span>{children}</span>
    </div>
  );
}

function TabButton({
  on,
  onClick,
  children,
  color = C.accent,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="tap"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 32,
        padding: "0 12px",
        flex: "none",
        borderRadius: "var(--r-btn)",
        fontSize: 14,
        fontWeight: 600,
        color: on ? C.text : C.muted,
        background: on ? alpha(color, 16) : "transparent",
        boxShadow: on ? `inset 0 0 0 1px ${alpha(color, 45)}` : "none",
      }}
    >
      {children}
    </button>
  );
}

function Presence({ editors, you }: { editors: EditorPresence[]; you: string }) {
  const shown = editors.slice(0, 5);
  return (
    <div style={{ display: "flex", alignItems: "center" }} className="hide-sm">
      {shown.map((e, i) => (
        <span
          key={e.id}
          title={e.id === you ? `${e.name} (you)` : e.name}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            marginLeft: i ? -6 : 0,
            fontSize: 12,
            fontWeight: 700,
            color: "#0b0d12",
            background: e.color,
            border: `2px solid ${C.panelDeep}`,
          }}
        >
          {(e.name.trim()[0] ?? "?").toUpperCase()}
        </span>
      ))}
      {editors.length > shown.length && (
        <span className="chip" style={{ marginLeft: 4 }}>
          +{editors.length - shown.length}
        </span>
      )}
    </div>
  );
}

function SharePanel({
  slug,
  canEdit,
  name,
  onName,
  notify,
}: {
  slug: string;
  canEdit: boolean;
  name: string;
  onName: (v: string) => void;
  notify: (t: string, tone?: "ok" | "error" | "info") => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: C.muted }}>Quiz code</div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 600, color: C.accent }}>
            {slug}
          </div>
        </div>
        <button className="btn btn-sm" onClick={() => copyText(slug, notify, "Code copied")}>
          <Icon name="copy" size={15} /> Copy
        </button>
      </div>
      <div className="hint">Any host can load this code to play your quiz.</div>
      <div style={{ height: 1, background: C.lineSoft }} />
      {canEdit && (
        <button
          className="menu-item"
          onClick={() => copyText(linkWithKey(`/edit/${slug}`, keyFor("edit-key", slug)), notify, "Edit link copied — anyone with it can change this quiz")}
        >
          <Icon name="users" size={16} />
          <span style={{ flex: 1 }}>Invite co-editors</span>
          <Icon name="copy" size={14} />
        </button>
      )}
      <button className="menu-item" onClick={() => copyText(`${location.origin}/edit/${slug}`, notify, "View-only link copied")}>
        <Icon name="eye" size={16} />
        <span style={{ flex: 1 }}>Copy view-only link</span>
        <Icon name="copy" size={14} />
      </button>
      <div style={{ height: 1, background: C.lineSoft }} />
      <Field label="Your name, as co-editors see it">
        <input className="input" value={name} onChange={(e) => onName(e.target.value.slice(0, 24))} style={{ height: 38 }} />
      </Field>
    </div>
  );
}

function CategoryHeader({
  name,
  canDelete,
  first,
  last,
  onName,
  onMove,
  onDelete,
}: {
  name: string;
  canDelete: boolean;
  first: boolean;
  last: boolean;
  onName: (v: string) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="shape"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        background: CELL,
        color: C.cellInk,
        borderTop: "var(--cat-rule)",
        minHeight: 56,
      }}
    >
      <Synced
        value={name}
        onCommit={onName}
        placeholder="Category"
        multiline
        className="input input-ghost display"
        style={{
          height: "100%",
          minHeight: 56,
          textAlign: "center",
          fontSize: 14,
          lineHeight: 1.15,
          padding: "10px 26px 8px 8px",
          borderRadius: 0,
          color: "inherit",
          overflow: "hidden",
        }}
        ariaLabel="Category name"
      />
      <div style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)" }}>
        <Popover
          width={190}
          trigger={({ toggle }) => (
            <button className="btn btn-ghost btn-icon btn-sm" onClick={toggle} aria-label="Category options" style={{ width: 26, height: 26 }}>
              <Icon name="more" size={16} />
            </button>
          )}
        >
          {(close) => (
            <>
              <button className="menu-item" disabled={first} onClick={() => (onMove(-1), close())}>
                <Icon name="chevronLeft" size={16} /> Move left
              </button>
              <button className="menu-item" disabled={last} onClick={() => (onMove(1), close())}>
                <Icon name="chevronRight" size={16} /> Move right
              </button>
              <ConfirmButton className="menu-item danger" disabled={!canDelete} confirmLabel="Tap again to delete" onConfirm={() => (onDelete(), close())}>
                <Icon name="trash" size={16} /> Delete category
              </ConfirmButton>
            </>
          )}
        </Popover>
      </div>
    </div>
  );
}

/** One grid row: the editable value in the gutter, then that row's cells. */
function RowCells({
  ri,
  value,
  roundIndex,
  emit,
  cells,
}: {
  ri: number;
  value: number;
  roundIndex: number;
  emit: (op: BoardOp) => void;
  cells: React.ReactNode[];
}) {
  return (
    <>
      <Synced
        key={`${roundIndex}:${ri}`}
        value={String(value)}
        onCommit={(raw) => emit({ type: "value", round: roundIndex, row: ri, value: Number(raw.replace(/[^0-9-]/g, "")) || 0 })}
        className="input input-ghost display num"
        style={{ height: "100%", padding: 0, textAlign: "center", fontSize: 15, color: C.accent }}
        ariaLabel={`Value for row ${ri + 1}`}
      />
      {cells}
    </>
  );
}

function Cell({
  clue,
  value,
  active,
  watchers,
  onClick,
}: {
  clue: Clue;
  value: number;
  active: boolean;
  watchers: EditorPresence[];
  onClick: () => void;
}) {
  const ready = isReady(clue);
  const started = isStarted(clue);
  const ring = watchers[0]?.color ?? (active ? C.accent : "transparent");
  return (
    <button
      onClick={onClick}
      className="shape tap"
      aria-label={`${value} — ${clue.t || "empty"}`}
      aria-current={active}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "9px 10px 9px 13px",
        textAlign: "left",
        overflow: "hidden",
        minHeight: 0,
        background: active ? alpha(C.accent, 10) : ready ? C.tile : C.panel,
        boxShadow: `inset 0 0 0 ${active || watchers.length ? 2 : 1}px ${ring === "transparent" ? C.lineSoft : ring}`,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: ready ? C.good : started ? C.warn : "transparent",
        }}
      />
      <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.muted, minHeight: 16 }}>
        {clue.dd && <Icon name="zap" size={14} style={{ color: C.warn }} fill />}
        {clue.media && <Icon name={MEDIA_ICON[clue.media]} size={14} style={{ color: C.info }} />}
        {clue.timerOff && <span style={{ fontSize: 12, fontWeight: 700, color: C.warn }}>∞</span>}
        <span style={{ flex: 1 }} />
        {watchers.map((w) => (
          <span key={w.id} className="dot" title={w.name} style={{ background: w.color }} />
        ))}
      </span>
      <span
        style={{
          fontSize: 13,
          lineHeight: 1.35,
          color: clue.t.trim() || clue.media ? C.text : C.faint,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {clue.t.trim() || (clue.media ? clue.mediaLabel?.trim() || `${capitalise(clue.media)} clue` : "Add clue")}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------- */

function MediaPicker({
  media,
  mediaKey,
  mediaLabel,
  onUpload,
  onYouTube,
  onRemove,
  onCaption,
  uploading,
  pct,
  usage,
  onError,
}: {
  media?: Media;
  mediaKey?: string;
  mediaLabel?: string;
  onUpload: (file: File) => void;
  onYouTube: (id: string) => void;
  onRemove: () => void;
  onCaption: (v: string) => void;
  uploading: boolean;
  pct: number;
  usage: StorageUsage | null;
  onError: (m: string) => void;
}) {
  const [youtube, setYoutube] = useState("");
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (media) {
    return (
      <div className="field">
        <span className="label">Media</span>
        {mediaKey ? (
          <ClueMedia media={media} mediaKey={mediaKey} label={mediaLabel} height={150} border={C.line} />
        ) : (
          <div className="hint">Placeholder: {media}</div>
        )}
        <Synced value={mediaLabel ?? ""} onCommit={onCaption} placeholder="Caption (optional)" className="input" style={{ height: 38, fontSize: 14 }} />
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ flex: 1 }}>
            <Icon name="refresh" size={15} /> {uploading ? `${Math.round(pct * 100)}%` : "Replace"}
          </button>
          <button className="btn btn-sm btn-danger" onClick={onRemove} style={{ flex: 1 }}>
            <Icon name="trash" size={15} /> Remove
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    );
  }

  function pick(file?: File) {
    if (fileRef.current) fileRef.current.value = "";
    if (file) onUpload(file);
  }

  const nearlyFull = usage && usage.board / usage.boardLimit > 0.5;

  return (
    <div className="field">
      <span className="label">Media</span>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        disabled={uploading}
        style={{
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          padding: "16px 12px",
          borderRadius: "var(--r-md)",
          border: `1.5px dashed ${over ? C.accent : C.edgeSoft}`,
          background: over ? alpha(C.accent, 8) : "transparent",
          color: C.dim,
          fontSize: 14,
        }}
      >
        {uploading ? (
          <>
            <span style={{ fontWeight: 600, color: C.text }}>Uploading {Math.round(pct * 100)}%</span>
            <span style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: `${pct * 100}%`, background: C.accent }} />
          </>
        ) : (
          <>
            <Icon name="upload" size={20} />
            <span>
              <span style={{ color: C.text, fontWeight: 600 }}>Add a picture, video or sound</span>
            </span>
            <span className="hint">
              Drop a file or click · up to {mediaLimitLabel()}
              {nearlyFull && usage ? ` · ${formatBytes(usage.board)} of ${formatBytes(usage.boardLimit)} used` : ""}
            </span>
          </>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <form
        style={{ display: "flex", gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          const id = youTubeId(youtube);
          if (!id) return onError("That doesn't look like a YouTube link");
          onYouTube(id);
          setYoutube("");
        }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <Icon name="youtube" size={16} style={{ position: "absolute", left: 12, top: 11, color: C.muted }} />
          <input
            className="input"
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
            placeholder="Or paste a YouTube link"
            style={{ height: 38, paddingLeft: 36, fontSize: 14 }}
          />
        </div>
        {youtube.trim() && (
          <button className="btn btn-sm" type="submit" disabled={!youTubeId(youtube)} style={{ height: 38 }}>
            Add
          </button>
        )}
      </form>
    </div>
  );
}

/** Timer and read-delay overrides, folded away until they're wanted. */
function Timing({
  timerOff,
  seconds,
  readSeconds,
  boardSeconds,
  boardRead,
  isVideo,
  onTimerOff,
  onSeconds,
  onRead,
}: {
  timerOff: boolean;
  seconds?: number;
  readSeconds?: number;
  boardSeconds: number;
  boardRead: number;
  isVideo?: boolean;
  onTimerOff: (v: boolean) => void;
  onSeconds: (v: number | null) => void;
  onRead: (v: number | null) => void;
}) {
  const custom = timerOff || seconds !== undefined || readSeconds !== undefined;
  const [open, setOpen] = useState(custom);
  const summary = [
    timerOff ? "No timer" : `${seconds ?? boardSeconds}s to answer`,
    (readSeconds ?? boardRead) > 0 ? `${readSeconds ?? boardRead}s read time` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 40, textAlign: "left" }}
      >
        <Icon name="timer" size={18} style={{ color: custom ? C.accent : C.muted }} />
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>Timing</span>
          <span className="hint">{summary}</span>
        </span>
        <Icon name="chevronDown" size={16} style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none", transition: "transform .16s" }} />
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 30 }}>
          <SwitchRow label="Countdown" checked={!timerOff} onChange={(v) => onTimerOff(!v)} hint={timerOff ? "Buzzers stay open until you close the clue" : undefined} />
          {!timerOff && (
            <NumberField label="Seconds to answer" value={seconds} placeholder={boardSeconds} onChange={onSeconds} />
          )}
          <NumberField
            label="Read time before buzzers open"
            value={readSeconds}
            placeholder={boardRead}
            allowZero
            onChange={onRead}
            hint={isVideo ? "Set this to the clip's length" : undefined}
          />
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  placeholder,
  onChange,
  allowZero,
  hint,
}: {
  label: string;
  value?: number;
  placeholder: number;
  onChange: (v: number | null) => void;
  allowZero?: boolean;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div style={{ position: "relative" }}>
        <Synced
          value={value === undefined ? "" : String(value)}
          onCommit={(raw) => {
            const t = raw.trim();
            const n = Number(t.replace(/[^0-9]/g, ""));
            if (t === "") onChange(null);
            else if (allowZero) onChange(n || 0);
            else onChange(n || null);
          }}
          placeholder={`${placeholder} (default)`}
          className="input num"
          style={{ height: 38, fontSize: 14, paddingRight: 40 }}
        />
        <span style={{ position: "absolute", right: 12, top: 10, fontSize: 13, color: C.faint }}>sec</span>
      </div>
    </Field>
  );
}

/* ---------------------------------------------------------------- */

function FinalEditor({
  final,
  boardSeconds,
  boardRead,
  emit,
  onUpload,
  uploading,
  pct,
  usage,
  onError,
}: {
  final?: FinalClue;
  boardSeconds: number;
  boardRead: number;
  emit: (op: BoardOp) => void;
  onUpload: (f: File) => void;
  uploading: boolean;
  pct: number;
  usage: StorageUsage | null;
  onError: (m: string) => void;
}) {
  const f = final ?? { category: "", t: "", a: "" };
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="display" style={{ fontSize: 28, color: C.special }}>
          Final round
        </div>
        <div className="dim" style={{ marginTop: 4 }}>
          Everyone with points wagers, then writes an answer on their phone. Leave it empty to skip.
        </div>
      </div>
      <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
        <Field label="Category">
          <Synced value={f.category} onCommit={(v) => emit({ type: "final", field: "category", value: v })} placeholder="Shown while players wager" className="input" />
        </Field>
        <Field label="Clue">
          <Synced
            multiline
            value={f.t}
            onCommit={(v) => emit({ type: "final", field: "t", value: v })}
            placeholder="Revealed once every wager is in"
            className="input"
            style={{ height: 110, fontSize: 16 }}
          />
        </Field>
        <Field label="Answer">
          <Synced value={f.a} onCommit={(v) => emit({ type: "final", field: "a", value: v })} placeholder="What is…?" className="input" style={{ fontWeight: 600, color: C.info }} />
        </Field>
        <MediaPicker
          media={f.media}
          mediaKey={f.mediaKey}
          mediaLabel={f.mediaLabel}
          onUpload={onUpload}
          onYouTube={(id) => emit({ type: "finalMedia", value: "youtube", key: id })}
          onRemove={() => emit({ type: "finalMedia", value: null })}
          onCaption={(v) => emit({ type: "final", field: "mediaLabel", value: v })}
          uploading={uploading}
          pct={pct}
          usage={usage}
          onError={onError}
        />
        <Timing
          timerOff={!!f.timerOff}
          seconds={f.seconds}
          readSeconds={f.readSeconds}
          boardSeconds={boardSeconds}
          boardRead={boardRead}
          onTimerOff={(v) => emit({ type: "finalTimerOff", value: v })}
          onSeconds={(v) => emit({ type: "finalSeconds", value: v })}
          onRead={(v) => emit({ type: "finalReadSeconds", value: v })}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function SettingsDrawer({
  open,
  onClose,
  game,
  roundIndex,
  emit,
  notify,
  onRoundDeleted,
  onBlank,
}: {
  open: boolean;
  onClose: () => void;
  game: Game;
  roundIndex: number | null;
  emit: (op: BoardOp) => void;
  notify: (t: string, tone?: "ok" | "error" | "info") => void;
  onRoundDeleted: () => void;
  onBlank: () => void;
}) {
  const importRef = useRef<HTMLInputElement>(null);
  const round = roundIndex === null ? null : game.rounds[roundIndex];

  const download = () => {
    const blob = new Blob([JSON.stringify(game, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(game.title || "quiz").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Drawer open={open} onClose={onClose} title="Settings">
      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="eyebrow">Every clue</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Seconds to answer">
            <Synced
              value={String(game.timerSeconds ?? DEFAULT_CLUE_SECONDS)}
              onCommit={(raw) => {
                const n = Number(raw.replace(/[^0-9]/g, ""));
                if (n) emit({ type: "boardSeconds", value: n });
              }}
              className="input num"
            />
          </Field>
          <Field label="Read time">
            <Synced
              value={String(game.readSeconds ?? DEFAULT_READ_SECONDS)}
              onCommit={(raw) => emit({ type: "boardReadSeconds", value: Number(raw.replace(/[^0-9]/g, "")) || 0 })}
              className="input num"
            />
          </Field>
        </div>
        <div className="hint">Read time keeps buzzers shut while the clue is read out. Any clue can override both.</div>
      </section>

      {round && roundIndex !== null && (
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="eyebrow">This round</div>
          <Field label="Name">
            <Synced key={`rn:${roundIndex}`} value={round.name} onCommit={(v) => emit({ type: "roundName", index: roundIndex, value: v })} className="input" />
          </Field>
          {roundIndex > 0 && (
            <button className="btn" onClick={() => emit({ type: "roundDouble", index: roundIndex })}>
              Set values to double the previous round
            </button>
          )}
          {game.rounds.length > 1 && (
            <ConfirmButton
              className="btn btn-danger"
              confirmLabel="Tap again to delete this round"
              onConfirm={() => {
                emit({ type: "roundDelete", index: roundIndex });
                onRoundDeleted();
              }}
            >
              <Icon name="trash" size={16} /> Delete round
            </ConfirmButton>
          )}
        </section>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="eyebrow">Backup</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" style={{ flex: 1 }} onClick={download}>
            <Icon name="download" size={16} /> Export
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={() => importRef.current?.click()}>
            <Icon name="upload" size={16} /> Import
          </button>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const parsed = parseGame(JSON.parse(await file.text()));
              if (!parsed) throw new Error("That file isn't a quiz");
              emit({ type: "replace", game: parsed });
              notify("Quiz imported");
              onClose();
            } catch (err) {
              notify((err as Error).message, "error");
            }
          }}
        />
        <div className="hint">Importing replaces everything in this quiz.</div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="eyebrow">Start over</div>
        <a className="btn" href="/edit">
          <Icon name="plus" size={16} /> New quiz
        </a>
        <ConfirmButton className="btn btn-danger" confirmLabel="Tap again — this wipes every clue" onConfirm={onBlank}>
          <Icon name="trash" size={16} /> Clear this quiz
        </ConfirmButton>
      </section>
    </Drawer>
  );
}
