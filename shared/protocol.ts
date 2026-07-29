/**
 * The wire contract shared by the room server and all three client surfaces.
 *
 * The `Game` shape is deliberately identical to what the board editor in
 * `design/Guardian Jeopardy.dc.html` exports, so a game authored there can be
 * pasted straight into the host console with no conversion step.
 */

export const ROWS = 5;

export type Media = "image" | "video";
export type Role = "host" | "tv" | "player";
export type Lockout = "queue" | "first-only";

export interface Clue {
  /** Stable across edits, so collaborative ops never address a moving index. */
  id?: string;
  t: string;
  a: string;
  dd?: boolean;
  media?: Media;
  /** R2 object key for an uploaded file. Absent means show a placeholder. */
  mediaKey?: string;
  mediaLabel?: string;
  /** How long this clue gets. Falls back to the board default. */
  seconds?: number;
  /** Run this clue with no time limit at all. Overrides `seconds`. */
  timerOff?: boolean;
}

/** Uploads are refused above this; Workers cap a request body at 100 MB anyway. */
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

export interface Category {
  id?: string;
  name: string;
  clues: Clue[];
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** The one clue everybody plays at once, at the end. */
export interface FinalClue {
  category: string;
  t: string;
  a: string;
  media?: Media;
  mediaKey?: string;
  mediaLabel?: string;
  /** How long everyone gets to write. Falls back to the board default. */
  seconds?: number;
  /** No clock at all — the host decides when pens are down. */
  timerOff?: boolean;
}

/** Fallback when neither the clue nor the board sets a time. */
export const DEFAULT_CLUE_SECONDS = 20;
export const MIN_CLUE_SECONDS = 5;
export const MAX_CLUE_SECONDS = 300;

export function clampSeconds(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CLUE_SECONDS;
  return Math.max(MIN_CLUE_SECONDS, Math.min(MAX_CLUE_SECONDS, Math.round(n)));
}

export interface Game {
  title: string;
  subtitle: string;
  roomCode: string;
  values: number[];
  players?: { name: string; cls: string }[];
  categories: Category[];
  final?: FinalClue;
  /** Board-wide default clue time; individual clues may override it. */
  timerSeconds?: number;
}

/**
 * Whether this clue is on the clock at all.
 *
 * Untimed clues never close their buzzer, so the host decides when to move on —
 * useful for a clue with a long video, or a round played at a relaxed pace.
 */
export function isTimed(clue: Clue | FinalClue | null): boolean {
  return !(clue as Clue | null)?.timerOff;
}

/** How long the given clue gets, resolving clue → board → fallback. */
export function secondsFor(game: Game | null, clue: Clue | FinalClue | null): number {
  const own = (clue as Clue | null)?.seconds;
  if (typeof own === "number" && own > 0) return clampSeconds(own);
  if (typeof game?.timerSeconds === "number" && game.timerSeconds > 0) return clampSeconds(game.timerSeconds);
  return DEFAULT_CLUE_SECONDS;
}

export interface Player {
  id: string;
  name: string;
  cls: string;
  score: number;
  connected: boolean;
}

/**
 * One buzz. `ms` is measured on the server from the moment the clue opened —
 * never from a client clock, which players could lie about or simply have set
 * wrong. Ordering is arrival order at the room, which is the only ordering all
 * players can agree on.
 */
export interface Buzz {
  playerId: string;
  ms: number;
}

/**
 * What the open clue is currently doing.
 *
 * - `buzz`  — an ordinary clue; anyone may ring in.
 * - `wager` — a Daily Double is up and one player is choosing a stake. The clue
 *             text must stay hidden on the TV while this lasts.
 * - `live`  — the clue is showing. On a Daily Double only the wagering player
 *             may answer; otherwise it is the buzz queue's turn.
 */
export type Phase = "buzz" | "wager" | "live";

export interface DailyDouble {
  /** The player the clue belongs to. Nobody else may answer it. */
  playerId: string;
  /** null until locked in. */
  wager: number | null;
  min: number;
  max: number;
}

/**
 * The final round.
 *
 * Everyone eligible wagers at once, blind, knowing only the category. Wagers
 * and written responses stay hidden from every screen until the host starts
 * revealing, then they come out one player at a time — lowest score first, so
 * the leader's answer lands last.
 */
/**
 * The closing standings, revealed one place at a time.
 *
 * `order` runs worst-first, because that is the order a game show reveals in —
 * you count up to the winner rather than down from them.
 */
export interface Results {
  order: string[];
  /** How many places have been shown so far. */
  revealed: number;
}

/** Placings, best first, with ties sharing a rank. */
export function standings(players: Player[]): { id: string; rank: number; score: number }[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let previousScore: number | null = null;
  let previousRank = 0;
  return sorted.map((p, i) => {
    const rank = previousScore !== null && p.score === previousScore ? previousRank : i + 1;
    previousScore = p.score;
    previousRank = rank;
    return { id: p.id, rank, score: p.score };
  });
}

export type FinalPhase = "wager" | "clue" | "reveal" | "done";

export interface FinalEntry {
  wager: number | null;
  response: string;
  /** Set once the player commits; the host can also force past a slow phone. */
  locked: boolean;
  judged: "correct" | "wrong" | null;
}

export interface FinalRound {
  phase: FinalPhase;
  /** Set once writing is over — by the clock, by everyone finishing, or by the host. */
  writingClosed: boolean;
  /** Player ids in reveal order, lowest score first. Fixed when the round starts. */
  order: string[];
  entries: Record<string, FinalEntry>;
  /** Index into `order` of the player currently being revealed. */
  revealIndex: number;
}

export interface RoomState {
  game: Game | null;
  /**
   * False while the room is still gathering. The TV shows the lobby, the board
   * is closed, and players can join without anything being live.
   */
  started: boolean;
  /** Non-null once the final round has started. */
  final: FinalRound | null;
  /** Non-null once the host has moved to the closing standings. */
  results: Results | null;
  /**
   * The host's most recent ruling, so screens can react to the outcome.
   *
   * A wrong answer looks different in every mode — an ordinary clue grows
   * `spent`, a Daily Double simply closes exactly as a correct one does, and the
   * final round marks an entry. Rather than have each screen infer the verdict
   * from those, the room states it. `seq` increments so two identical rulings in
   * a row are still two distinct events.
   */
  lastRuling: { correct: boolean; seq: number } | null;
  players: Player[];
  /** Played clues, as "column-row" keys. */
  used: string[];
  open: { c: number; r: number } | null;
  phase: Phase;
  /** Set while a Daily Double is in play, cleared when the clue closes. */
  dd: DailyDouble | null;
  /**
   * Who picks the next clue — the last player to answer correctly. Used to
   * decide whose Daily Double it is by default; the host can reassign.
   */
  control: string | null;
  /** Server epoch ms when the clue went live; drives every screen's timer. */
  openedAt: number | null;
  timerSeconds: number;
  /** False when the open clue runs with no time limit. */
  timed: boolean;
  revealed: boolean;
  buzzes: Buzz[];
  /** Players who already answered this clue wrong and may not buzz again. */
  spent: string[];
  lockout: Lockout;
  hostConnected: boolean;
}

export type ClientMessage =
  | { type: "join"; role: Role; playerId?: string; name?: string; cls?: string }
  | { type: "rename"; name: string; cls: string }
  | { type: "buzz" }
  | { type: "setGame"; game: Game }
  | { type: "openClue"; c: number; r: number }
  | { type: "closeClue" }
  | { type: "reveal"; on: boolean }
  | { type: "judge"; correct: boolean }
  /** Sent by the wagering player, or by the host on their behalf. */
  | { type: "setWager"; wager: number }
  /** Host reassigns a Daily Double to a different player before the wager. */
  | { type: "setDDPlayer"; playerId: string }
  | { type: "adjust"; playerId: string; delta: number }
  | { type: "setLockout"; lockout: Lockout }
  /** Host: leave the lobby and open the board. */
  | { type: "startGame" }
  /** Host: back to the lobby, keeping scores and the loaded board. */
  | { type: "returnToLobby" }
  | { type: "resetBoard" }
  /** Host: begin the final round. */
  | { type: "startFinal" }
  /** Host: the single "next" control — wager → clue → reveal → next player → done. */
  | { type: "finalAdvance" }
  /** Host: abandon the final round and go back to the board. */
  | { type: "endFinal" }
  | { type: "setFinalWager"; wager: number }
  | { type: "setFinalResponse"; response: string }
  /** Host: call pens down early, before the clock runs out. */
  | { type: "closeFinalWriting" }
  | { type: "lockFinal" }
  /** Host: rule on the player currently being revealed. */
  | { type: "judgeFinal"; correct: boolean }
  /** Host: move to the closing standings. */
  | { type: "showResults" }
  /** Host: reveal the next place, worst to best. */
  | { type: "revealNextPlace" }
  /** Host: leave the standings and go back to the board. */
  | { type: "endResults" }
  /** Host: wipe the room entirely so its code starts fresh next time. */
  | { type: "closeRoom" };

/** A room untouched for this long is deleted. */
export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

export type ServerMessage =
  | { type: "state"; state: RoomState; you: string | null }
  | { type: "error"; message: string };

/**
 * Legal wager range for a Daily Double.
 *
 * The ceiling is the greater of the player's own score and the biggest value on
 * the board, so someone sitting on zero — or in the red — can still bet
 * something. The floor gives way when the ceiling is smaller than it, which a
 * custom value ladder can easily cause.
 */
export function wagerBounds(score: number, values: number[]): { min: number; max: number } {
  const top = values.length ? Math.max(...values) : 0;
  const max = Math.max(score, top, 0);
  return { min: Math.min(5, max), max };
}

/**
 * Who may play the final round: anyone in the black. A player on zero or below
 * has nothing to wager, which is the traditional rule and also the only one
 * that makes arithmetic sense.
 */
export function finalEligible(players: Player[]): Player[] {
  return players.filter((p) => p.score > 0);
}

/** Final-round wagers run from nothing to everything the player has. */
export function finalBounds(score: number): { min: number; max: number } {
  return { min: 0, max: Math.max(0, score) };
}

export function emptyRoom(): RoomState {
  return {
    game: null,
    started: false,
    final: null,
    results: null,
    lastRuling: null,
    players: [],
    used: [],
    open: null,
    phase: "buzz",
    dd: null,
    control: null,
    openedAt: null,
    timerSeconds: DEFAULT_CLUE_SECONDS,
    timed: true,
    revealed: false,
    buzzes: [],
    spent: [],
    lockout: "queue",
    hostConnected: false,
  };
}

export function clueKey(c: number, r: number): string {
  return `${c}-${r}`;
}

/** Narrow unknown JSON into a Game, or return null. Used by both ends. */
export function parseGame(raw: unknown): Game | null {
  const g = raw as Partial<Game> | null;
  if (!g || !Array.isArray(g.categories) || g.categories.length === 0) return null;

  const categories: Category[] = g.categories.slice(0, 8).map((c) => {
    const clues: Clue[] = [];
    for (let i = 0; i < ROWS; i++) {
      const q = (c?.clues ?? [])[i] as Partial<Clue> | undefined;
      const media = q?.media === "image" || q?.media === "video" ? q.media : undefined;
      const mediaKey = typeof q?.mediaKey === "string" && q.mediaKey ? q.mediaKey : undefined;
      clues.push({
        id: typeof q?.id === "string" && q.id ? q.id : newId(),
        t: String(q?.t ?? ""),
        a: String(q?.a ?? ""),
        ...(q?.dd ? { dd: true as const } : {}),
        ...(media ? { media, mediaLabel: String(q?.mediaLabel ?? "") } : {}),
        ...(media && mediaKey ? { mediaKey } : {}),
        ...(typeof q?.seconds === "number" && q.seconds > 0 ? { seconds: clampSeconds(q.seconds) } : {}),
        ...(q?.timerOff ? { timerOff: true as const } : {}),
      });
    }
    return {
      id: typeof c?.id === "string" && c.id ? c.id : newId(),
      name: String(c?.name ?? ""),
      clues,
    };
  });

  const values =
    Array.isArray(g.values) && g.values.length === ROWS
      ? g.values.map((v) => Number(v) || 0)
      : [200, 400, 600, 800, 1000];

  const f = g.final as Partial<FinalClue> | undefined;
  const fMedia = f?.media === "image" || f?.media === "video" ? f.media : undefined;
  const fKey = typeof f?.mediaKey === "string" && f.mediaKey ? f.mediaKey : undefined;
  const final: FinalClue | undefined =
    f && (String(f.t ?? "").trim() || String(f.a ?? "").trim())
      ? {
          category: String(f.category ?? ""),
          t: String(f.t ?? ""),
          a: String(f.a ?? ""),
          ...(fMedia ? { media: fMedia, mediaLabel: String(f.mediaLabel ?? "") } : {}),
          ...(fMedia && fKey ? { mediaKey: fKey } : {}),
          ...(typeof f.seconds === "number" && f.seconds > 0 ? { seconds: clampSeconds(f.seconds) } : {}),
          ...(f.timerOff ? { timerOff: true as const } : {}),
        }
      : undefined;

  return {
    title: String(g.title ?? "GUARDIAN JEOPARDY"),
    subtitle: String(g.subtitle ?? ""),
    roomCode: String(g.roomCode ?? ""),
    values,
    players: Array.isArray(g.players)
      ? g.players.map((p) => ({ name: String(p?.name ?? ""), cls: String(p?.cls ?? "") }))
      : undefined,
    categories,
    ...(final ? { final } : {}),
    ...(typeof g.timerSeconds === "number" && g.timerSeconds > 0
      ? { timerSeconds: clampSeconds(g.timerSeconds) }
      : {}),
  };
}

/* ==================== collaborative board editing ====================
   Edits travel as small operations rather than whole documents, so two people
   working on different clues both land instead of overwriting each other.
   Everything addresses categories and clues by stable id, never by index — a
   category being deleted or moved must not silently redirect someone else's
   keystrokes into the wrong cell.

   Two people in the *same* field is still last-write-wins. That is a deliberate
   limit: merging characters within one clue would need a CRDT, and presence
   makes the collision visible enough to avoid. */

export const MIN_CATS = 2;
export const MAX_CATS = 8;

export type BoardOp =
  | { type: "meta"; field: "title" | "subtitle"; value: string }
  | { type: "value"; row: number; value: number }
  | { type: "final"; field: "category" | "t" | "a" | "mediaLabel"; value: string }
  | { type: "finalMedia"; value: Media | null; key?: string | null }
  | { type: "finalSeconds"; value: number | null }
  | { type: "finalTimerOff"; value: boolean }
  /** Per-clue time. `value: null` falls back to the board default. */
  | { type: "clueSeconds"; catId: string; row: number; value: number | null }
  | { type: "clueTimerOff"; catId: string; row: number; value: boolean }
  | { type: "boardSeconds"; value: number }
  | { type: "catName"; catId: string; value: string }
  | { type: "catAdd" }
  | { type: "catDelete"; catId: string }
  | { type: "catMove"; catId: string; dir: -1 | 1 }
  | { type: "clueText"; catId: string; row: number; field: "t" | "a" | "mediaLabel"; value: string }
  | { type: "clueDD"; catId: string; row: number; value: boolean }
  /** `key` present means a real uploaded file; absent means a placeholder. */
  | { type: "clueMedia"; catId: string; row: number; value: Media | null; key?: string | null }
  | { type: "clueClear"; catId: string; row: number }
  /** Wholesale swap — JSON import, or blanking the board. */
  | { type: "replace"; game: Game };

/** Who else is in this board right now. */
export interface EditorPresence {
  id: string;
  name: string;
  color: string;
  /** The cell they are looking at, so others can steer clear. */
  focus: { catId: string; row: number } | null;
}

export type BoardClientMessage =
  | { type: "hello"; name: string }
  | { type: "op"; op: BoardOp }
  | { type: "focus"; focus: { catId: string; row: number } | null };

export type BoardServerMessage =
  | { type: "board"; game: Game; editors: EditorPresence[]; you: string }
  | { type: "editors"; editors: EditorPresence[] }
  | { type: "error"; message: string };

function blankCategory(name: string): Category {
  return {
    id: newId(),
    name,
    clues: Array.from({ length: ROWS }, () => ({ id: newId(), t: "", a: "" })),
  };
}

/** Apply one operation. Pure: returns a new game, never mutates the input. */
export function applyBoardOp(game: Game, op: BoardOp): Game {
  const withCat = (catId: string, fn: (cat: Category) => Category): Game => {
    const i = game.categories.findIndex((c) => c.id === catId);
    if (i === -1) return game; // category was deleted out from under this op
    const categories = game.categories.slice();
    categories[i] = fn(categories[i]);
    return { ...game, categories };
  };

  const withClue = (catId: string, row: number, fn: (clue: Clue) => Clue): Game =>
    withCat(catId, (cat) => {
      if (row < 0 || row >= cat.clues.length) return cat;
      const clues = cat.clues.slice();
      clues[row] = fn(clues[row]);
      return { ...cat, clues };
    });

  switch (op.type) {
    case "meta":
      return { ...game, [op.field]: op.value };

    case "value": {
      if (op.row < 0 || op.row >= game.values.length) return game;
      const values = game.values.slice();
      values[op.row] = Number.isFinite(op.value) ? op.value : 0;
      return { ...game, values };
    }

    case "final":
      return {
        ...game,
        final: { category: "", t: "", a: "", ...(game.final ?? {}), [op.field]: op.value },
      };

    case "finalMedia": {
      const next: FinalClue = { category: "", t: "", a: "", ...(game.final ?? {}) };
      if (op.value) {
        next.media = op.value;
        next.mediaLabel = next.mediaLabel ?? "";
        if (op.key) next.mediaKey = op.key;
        else if (op.key === null) delete next.mediaKey;
      } else {
        delete next.media;
        delete next.mediaKey;
        delete next.mediaLabel;
      }
      return { ...game, final: next };
    }

    case "finalSeconds": {
      const next: FinalClue = { category: "", t: "", a: "", ...(game.final ?? {}) };
      if (op.value === null) delete next.seconds;
      else next.seconds = clampSeconds(op.value);
      return { ...game, final: next };
    }

    case "finalTimerOff": {
      const next: FinalClue = { category: "", t: "", a: "", ...(game.final ?? {}) };
      if (op.value) next.timerOff = true;
      else delete next.timerOff;
      return { ...game, final: next };
    }

    case "clueSeconds":
      return withClue(op.catId, op.row, (clue) => {
        const next = { ...clue };
        if (op.value === null) delete next.seconds;
        else next.seconds = clampSeconds(op.value);
        return next;
      });

    case "clueTimerOff":
      return withClue(op.catId, op.row, (clue) => {
        const next = { ...clue };
        if (op.value) next.timerOff = true;
        else delete next.timerOff;
        return next;
      });

    case "boardSeconds":
      return { ...game, timerSeconds: clampSeconds(op.value) };

    case "catName":
      return withCat(op.catId, (cat) => ({ ...cat, name: op.value }));

    case "catAdd":
      if (game.categories.length >= MAX_CATS) return game;
      return { ...game, categories: [...game.categories, blankCategory("NEW CATEGORY")] };

    case "catDelete": {
      if (game.categories.length <= MIN_CATS) return game;
      const categories = game.categories.filter((c) => c.id !== op.catId);
      if (categories.length === game.categories.length) return game;
      return { ...game, categories };
    }

    case "catMove": {
      const i = game.categories.findIndex((c) => c.id === op.catId);
      const j = i + op.dir;
      if (i === -1 || j < 0 || j >= game.categories.length) return game;
      const categories = game.categories.slice();
      [categories[i], categories[j]] = [categories[j], categories[i]];
      return { ...game, categories };
    }

    case "clueText":
      return withClue(op.catId, op.row, (clue) => ({ ...clue, [op.field]: op.value }));

    case "clueDD":
      return withClue(op.catId, op.row, (clue) => {
        const next = { ...clue };
        if (op.value) next.dd = true;
        else delete next.dd;
        return next;
      });

    case "clueMedia":
      return withClue(op.catId, op.row, (clue) => {
        const next = { ...clue };
        if (op.value) {
          next.media = op.value;
          next.mediaLabel = clue.mediaLabel ?? "";
          if (op.key) next.mediaKey = op.key;
          else if (op.key === null) delete next.mediaKey; // switched back to a placeholder
        } else {
          delete next.media;
          delete next.mediaKey;
          delete next.mediaLabel;
        }
        return next;
      });

    case "clueClear":
      return withClue(op.catId, op.row, (clue) => ({ id: clue.id, t: "", a: "" }));

    case "replace":
      return op.game;

    default:
      return game;
  }
}

/** Board-library slugs: short, unambiguous, safe in a URL. */
const SLUG_ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ23456789";

export function newSlug(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  }
  return out;
}

export function isSlug(s: string): boolean {
  return /^[A-Z0-9]{4,12}$/.test(s);
}
