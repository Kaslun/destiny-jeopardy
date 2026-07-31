/**
 * The wire contract shared by the room server and all three client surfaces.
 *
 * The `Game` shape is deliberately identical to what the reference board editor
 * in `design/` exports, so a game authored there can be pasted straight into
 * the host console with no conversion step.
 */

export const ROWS = 5;

/**
 * What a clue shows.
 *
 * `youtube` costs no storage of ours at all — it is a video id, embedded — which
 * is why it is worth having alongside uploads rather than instead of them: a
 * board built out of clips can be shared without ever touching the storage
 * budget. `audio` is a real upload like the others; the TV needs something to
 * look at while it plays, so it draws a plate rather than a black rectangle.
 */
export type Media = "image" | "video" | "audio" | "youtube";

/** Media kinds backed by an uploaded file in R2. */
export function isUploaded(media: Media | undefined): boolean {
  return media === "image" || media === "video" || media === "audio";
}

/**
 * The video id inside any of YouTube's URL shapes, or null.
 *
 * Accepts a bare id too, because that is what someone who has done this before
 * will paste. Ids are 11 characters of URL-safe base64 and nothing else, which
 * is what makes them safe to drop straight into an embed URL.
 */
export function youTubeId(raw: string): string | null {
  const text = raw.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[1];
  }
  return null;
}
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
  /**
   * Seconds the clue is on screen before the buzzers open, so the host can
   * finish reading it — or a clip can finish playing — without the room racing
   * to buzz over the top. Falls back to the board default. Zero means the
   * buzzers open the moment the clue appears, which is the old behaviour.
   */
  readSeconds?: number;
}

/** Uploads are refused above this; Workers cap a request body at 100 MB anyway. */
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

/**
 * How much media everything may hold, in total.
 *
 * R2's free tier is 10 GB, and nothing in the app previously counted — uploads
 * simply accumulated until the bill arrived. Set below the tier rather than at
 * it, because the counter can only be as accurate as its last reconciliation
 * and a ceiling you can cross by a few hundred megabytes is not a ceiling.
 */
export const STORAGE_BUDGET_BYTES = 9 * 1024 * 1024 * 1024;

/** No single board may take more than this share of the budget. */
export const MAX_BOARD_BYTES = 1024 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** What the editor is told about remaining space. */
export interface StorageUsage {
  /** Bytes this board is using. */
  board: number;
  /** Bytes used across every board. */
  total: number;
  budget: number;
  boardLimit: number;
}

export interface Category {
  id?: string;
  name: string;
  clues: Clue[];
}

/**
 * One board.
 *
 * A game is a list of these rather than a single grid, so the traditional
 * second round — same shape, harder clues, doubled money — is a round rather
 * than a whole separate board with its own code and its own scores.
 *
 * Each round owns its own value ladder. That is the entire point of round two:
 * doubling the values is what makes a late comeback possible, and a ladder
 * shared across rounds could not express it.
 */
export interface Round {
  id?: string;
  /** Shown on the TV as the game's current chapter. */
  name: string;
  values: number[];
  categories: Category[];
}

export const MAX_ROUNDS = 4;

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
  /** Seconds on screen before the writing clock starts. */
  readSeconds?: number;
}

/** Fallback when neither the clue nor the board sets a time. */
export const DEFAULT_CLUE_SECONDS = 20;
export const MIN_CLUE_SECONDS = 5;
export const MAX_CLUE_SECONDS = 300;

export function clampSeconds(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CLUE_SECONDS;
  return Math.max(MIN_CLUE_SECONDS, Math.min(MAX_CLUE_SECONDS, Math.round(n)));
}

/**
 * The read delay defaults to nothing, so a board that says nothing about it
 * behaves exactly as it always has. Long enough to cover a video is allowed;
 * the host can always open the buzzers early.
 */
export const DEFAULT_READ_SECONDS = 0;
export const MAX_READ_SECONDS = 600;

export function clampReadSeconds(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_READ_SECONDS, Math.round(n));
}

/** The read delay for a clue, resolving clue → board → none. */
export function readSecondsFor(game: Game | null, clue: Clue | FinalClue | null): number {
  const own = (clue as Clue | null)?.readSeconds;
  if (typeof own === "number") return clampReadSeconds(own);
  if (typeof game?.readSeconds === "number") return clampReadSeconds(game.readSeconds);
  return DEFAULT_READ_SECONDS;
}

export interface Game {
  title: string;
  subtitle: string;
  roomCode: string;
  players?: { name: string; cls: string }[];
  /**
   * The boards, played in order. Always at least one.
   *
   * Games authored before rounds existed had `categories` and `values` at the
   * top level; {@link parseGame} folds those into a single round, so every
   * board ever saved still loads and nothing needs migrating in place.
   */
  rounds: Round[];
  final?: FinalClue;
  /** Board-wide default clue time; individual clues may override it. */
  timerSeconds?: number;
  /** Board-wide default read delay before buzzers open; clues may override it. */
  readSeconds?: number;
  /**
   * Which theme this board plays in. Resolved by `themeById` on the client, so
   * an id from a newer deploy degrades to the default rather than breaking.
   * Absent means the board predates themes and keeps the original look.
   */
  theme?: string;
}

/** Whether the buzzers are open yet, given the room's own clock. */
export function buzzersOpen(state: Pick<RoomState, "openedAt">, now = Date.now()): boolean {
  return state.openedAt !== null && now >= state.openedAt;
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
  /**
   * The player's chosen seat colour, as an index into the theme's tints.
   *
   * Absent means "whatever my seat happens to be", which is what everyone got
   * before this existed — so an old roster still renders, and two people who
   * both pick the same colour are allowed to. It is identity, not a key.
   */
  tint?: number;
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
  /** Which of the game's rounds is on the board. Index into `game.rounds`. */
  round: number;
  /**
   * Server epoch ms when the buzzers open — which may be *in the future* while
   * the clue is still being read. Everything downstream keys off this single
   * number: the countdown to the buzzers opening is `openedAt - now`, the clue's
   * own clock is `now - openedAt`, and a buzz is late if either is wrong. One
   * value rather than two removes the possibility of them disagreeing.
   */
  openedAt: number | null;
  /** Server epoch ms when the clue appeared on screen. */
  shownAt: number | null;
  /** How long the room gets to read before {@link openedAt}. */
  readSeconds: number;
  timerSeconds: number;
  /** False when the open clue runs with no time limit. */
  timed: boolean;
  revealed: boolean;
  /**
   * The clue is finished and is only still up so the room can see the answer.
   * Set when a ruling settles it — nobody else may buzz or be judged, and the
   * host's next action is to move on.
   */
  resolved: boolean;
  buzzes: Buzz[];
  /** Players who already answered this clue wrong and may not buzz again. */
  spent: string[];
  lockout: Lockout;
  hostConnected: boolean;
  /**
   * Whether this room has an owner yet. The key itself is never broadcast —
   * only the fact that one exists, so a second host console can explain why it
   * is read-only instead of appearing broken.
   */
  claimed: boolean;
  /** True on your own connection if you are holding the host key. */
  youAreHost: boolean;
}

export type ClientMessage =
  | {
      type: "join";
      role: Role;
      playerId?: string;
      name?: string;
      cls?: string;
      /** Proves the sender may host. Claims the room if it is unclaimed. */
      hostKey?: string;
    }
  | { type: "rename"; name: string; cls: string; tint?: number }
  | { type: "buzz" }
  | { type: "setGame"; game: Game }
  | { type: "openClue"; c: number; r: number }
  | { type: "closeClue" }
  /** Host: stop reading and let the room in, before the read delay is up. */
  | { type: "openBuzzers" }
  | { type: "reveal"; on: boolean }
  | { type: "judge"; correct: boolean }
  /** Sent by the wagering player, or by the host on their behalf. */
  | { type: "setWager"; wager: number }
  /** Host reassigns a Daily Double to a different player before the wager. */
  | { type: "setDDPlayer"; playerId: string }
  /** Host hands the next pick to someone — after a stalled clue, or a misfire. */
  | { type: "setControl"; playerId: string | null }
  /** Host moves to another round, forwards or back. */
  | { type: "setRound"; index: number }
  | { type: "adjust"; playerId: string; delta: number }
  /** Host removes someone from the room and shuts their buzzer. */
  | { type: "kick"; playerId: string }
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
    round: 0,
    openedAt: null,
    shownAt: null,
    readSeconds: DEFAULT_READ_SECONDS,
    timerSeconds: DEFAULT_CLUE_SECONDS,
    timed: true,
    revealed: false,
    resolved: false,
    buzzes: [],
    spent: [],
    lockout: "queue",
    hostConnected: false,
    claimed: false,
    youAreHost: false,
  };
}

/**
 * A played clue, addressed by round as well as position.
 *
 * The round is part of the key because two rounds have a 200 in the first
 * column, and without it playing one would cross the other off.
 */
export function clueKey(round: number, c: number, r: number): string {
  return `${round}-${c}-${r}`;
}

/** The board currently in play, or null if the index has run off the end. */
export function roundOf(game: Game | null, index: number): Round | null {
  return game?.rounds[index] ?? null;
}

/** How many clues a round holds. */
export function totalClues(round: Round | null): number {
  return round ? round.categories.length * ROWS : 0;
}

/** Every clue in this round has been played. */
export function boardExhausted(game: Game | null, round: number, used: string[]): boolean {
  const board = roundOf(game, round);
  const total = totalClues(board);
  if (total === 0) return false;
  const played = used.filter((k) => k.startsWith(`${round}-`)).length;
  return played >= total;
}

/** A blank board, used for a new game and for each round the author adds. */
export function blankRound(name: string, values: number[], categoryNames: string[]): Round {
  return {
    id: newId(),
    name,
    values,
    categories: categoryNames.map((n) => ({
      id: newId(),
      name: n,
      clues: Array.from({ length: ROWS }, () => ({ id: newId(), t: "", a: "" })),
    })),
  };
}

/** Round two's traditional ladder: the same rungs, worth twice as much. */
export function doubled(values: number[]): number[] {
  return values.map((v) => v * 2);
}

/** Narrow unknown JSON into a Game, or return null. Used by both ends. */
const MEDIA_KINDS: Media[] = ["image", "video", "audio", "youtube"];

function parseMedia(raw: unknown): Media | undefined {
  return MEDIA_KINDS.includes(raw as Media) ? (raw as Media) : undefined;
}

/** Narrow one category, backfilling ids so every edit op has something to address. */
function parseCategory(c: Partial<Category> | undefined): Category {
  const clues: Clue[] = [];
  for (let i = 0; i < ROWS; i++) {
    const q = (c?.clues ?? [])[i] as Partial<Clue> | undefined;
    const media = parseMedia(q?.media);
    // For an upload this is the R2 object key; for YouTube it is the video id.
    // One field either way, because every screen asks the same question of it:
    // "is there something here, and what do I point at?"
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
      // Zero is meaningful here — it overrides a board default back to "no
      // delay" — so this checks for a number rather than for truthiness.
      ...(typeof q?.readSeconds === "number" ? { readSeconds: clampReadSeconds(q.readSeconds) } : {}),
    });
  }
  return {
    id: typeof c?.id === "string" && c.id ? c.id : newId(),
    name: String(c?.name ?? ""),
    clues,
  };
}

function parseValues(raw: unknown, fallback = [200, 400, 600, 800, 1000]): number[] {
  return Array.isArray(raw) && raw.length === ROWS ? raw.map((v) => Number(v) || 0) : fallback;
}

function parseRound(r: Partial<Round> | undefined, index: number): Round | null {
  if (!r || !Array.isArray(r.categories) || r.categories.length === 0) return null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : newId(),
    name: String(r.name ?? `ROUND ${String(index + 1).padStart(2, "0")}`),
    values: parseValues(r.values),
    categories: r.categories.slice(0, MAX_CATS).map(parseCategory),
  };
}

export function parseGame(raw: unknown): Game | null {
  const g = raw as (Partial<Game> & { categories?: unknown; values?: unknown }) | null;
  if (!g) return null;

  // Two accepted shapes. A game authored since rounds existed carries
  // `rounds`; anything older carries `categories` and `values` at the top
  // level and becomes a one-round game. Reading both here rather than
  // migrating stored documents means no board has to be rewritten, and a board
  // that is never opened again still loads correctly years from now.
  let rounds: Round[] = [];
  if (Array.isArray(g.rounds) && g.rounds.length > 0) {
    rounds = g.rounds
      .slice(0, MAX_ROUNDS)
      .map((r, i) => parseRound(r, i))
      .filter((r): r is Round => r !== null);
  } else if (Array.isArray(g.categories) && g.categories.length > 0) {
    rounds = [
      {
        id: newId(),
        // The old `subtitle` field was where the round name lived on screen,
        // so that is what it becomes.
        name: String(g.subtitle ?? "").trim() || "ROUND 01",
        values: parseValues(g.values),
        categories: (g.categories as Partial<Category>[]).slice(0, MAX_CATS).map(parseCategory),
      },
    ];
  }

  if (rounds.length === 0) return null;

  const f = g.final as Partial<FinalClue> | undefined;
  const fMedia = parseMedia(f?.media);
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
          ...(typeof f.readSeconds === "number" ? { readSeconds: clampReadSeconds(f.readSeconds) } : {}),
        }
      : undefined;

  return {
    title: String(g.title ?? "JEOPARDY"),
    subtitle: String(g.subtitle ?? ""),
    roomCode: String(g.roomCode ?? ""),
    players: Array.isArray(g.players)
      ? g.players.map((p) => ({ name: String(p?.name ?? ""), cls: String(p?.cls ?? "") }))
      : undefined,
    rounds,
    ...(final ? { final } : {}),
    ...(typeof g.timerSeconds === "number" && g.timerSeconds > 0
      ? { timerSeconds: clampSeconds(g.timerSeconds) }
      : {}),
    ...(typeof g.readSeconds === "number" ? { readSeconds: clampReadSeconds(g.readSeconds) } : {}),
    // Kept as an opaque string rather than checked against the theme registry:
    // the server has no business knowing what themes the client ships, and an
    // unknown id already resolves to the default on the way out.
    ...(typeof g.theme === "string" && /^[a-z0-9-]{1,32}$/.test(g.theme) ? { theme: g.theme } : {}),
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
  | { type: "theme"; value: string }
  | { type: "value"; round: number; row: number; value: number }
  /* ---- rounds ---- */
  | { type: "roundAdd" }
  | { type: "roundDelete"; index: number }
  | { type: "roundName"; index: number; value: string }
  /** Set this round's ladder to twice the previous round's. */
  | { type: "roundDouble"; index: number }
  | { type: "final"; field: "category" | "t" | "a" | "mediaLabel"; value: string }
  | { type: "finalMedia"; value: Media | null; key?: string | null }
  | { type: "finalSeconds"; value: number | null }
  | { type: "finalTimerOff"; value: boolean }
  /** Per-clue time. `value: null` falls back to the board default. */
  | { type: "clueSeconds"; catId: string; row: number; value: number | null }
  | { type: "clueTimerOff"; catId: string; row: number; value: boolean }
  /** Per-clue read delay. `value: null` falls back to the board default. */
  | { type: "clueReadSeconds"; catId: string; row: number; value: number | null }
  | { type: "finalReadSeconds"; value: number | null }
  | { type: "boardSeconds"; value: number }
  | { type: "boardReadSeconds"; value: number }
  | { type: "catName"; catId: string; value: string }
  | { type: "catAdd"; round: number }
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
  /** `key` claims write access; without it the board opens read-only. */
  | { type: "hello"; name: string; key?: string }
  | { type: "op"; op: BoardOp }
  | { type: "focus"; focus: { catId: string; row: number } | null };

export type BoardServerMessage =
  | { type: "board"; game: Game; editors: EditorPresence[]; you: string }
  | { type: "editors"; editors: EditorPresence[] }
  /** Whether this connection's edits will be accepted. */
  | { type: "access"; canEdit: boolean }
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
  const withRound = (index: number, fn: (round: Round) => Round): Game => {
    if (index < 0 || index >= game.rounds.length) return game;
    const rounds = game.rounds.slice();
    rounds[index] = fn(rounds[index]);
    return { ...game, rounds };
  };

  /**
   * Category ids are unique across the whole game, so an op that names one
   * needs no round: it is found wherever it lives. That is what lets two people
   * edit different rounds at once without either op carrying — and possibly
   * disagreeing about — which round is current.
   */
  const withCat = (catId: string, fn: (cat: Category) => Category): Game => {
    for (let r = 0; r < game.rounds.length; r++) {
      const i = game.rounds[r].categories.findIndex((c) => c.id === catId);
      if (i === -1) continue;
      return withRound(r, (round) => {
        const categories = round.categories.slice();
        categories[i] = fn(categories[i]);
        return { ...round, categories };
      });
    }
    return game; // category was deleted out from under this op
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

    case "theme":
      return { ...game, theme: op.value };

    case "value":
      return withRound(op.round, (round) => {
        if (op.row < 0 || op.row >= round.values.length) return round;
        const values = round.values.slice();
        values[op.row] = Number.isFinite(op.value) ? op.value : 0;
        return { ...round, values };
      });

    case "roundAdd": {
      if (game.rounds.length >= MAX_ROUNDS) return game;
      const previous = game.rounds[game.rounds.length - 1];
      const index = game.rounds.length;
      return {
        ...game,
        rounds: [
          ...game.rounds,
          // A new round arrives doubled and the same width as the one before
          // it, because that is what a second round almost always is. Cheaper
          // to retype a ladder you did not want than to build the usual one by
          // hand every time.
          blankRound(
            `ROUND ${String(index + 1).padStart(2, "0")}`,
            doubled(previous.values),
            previous.categories.map(() => "NEW CATEGORY"),
          ),
        ],
      };
    }

    case "roundDelete": {
      if (game.rounds.length <= 1) return game; // a game is at least one board
      if (op.index < 0 || op.index >= game.rounds.length) return game;
      return { ...game, rounds: game.rounds.filter((_, i) => i !== op.index) };
    }

    case "roundName":
      return withRound(op.index, (round) => ({ ...round, name: op.value }));

    case "roundDouble":
      return withRound(op.index, (round) => {
        const previous = game.rounds[op.index - 1];
        return { ...round, values: doubled(previous ? previous.values : round.values) };
      });

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

    case "clueReadSeconds":
      return withClue(op.catId, op.row, (clue) => {
        const next = { ...clue };
        if (op.value === null) delete next.readSeconds;
        else next.readSeconds = clampReadSeconds(op.value);
        return next;
      });

    case "finalReadSeconds": {
      const next: FinalClue = { category: "", t: "", a: "", ...(game.final ?? {}) };
      if (op.value === null) delete next.readSeconds;
      else next.readSeconds = clampReadSeconds(op.value);
      return { ...game, final: next };
    }

    case "boardSeconds":
      return { ...game, timerSeconds: clampSeconds(op.value) };

    case "boardReadSeconds":
      return { ...game, readSeconds: clampReadSeconds(op.value) };

    case "catName":
      return withCat(op.catId, (cat) => ({ ...cat, name: op.value }));

    case "catAdd":
      return withRound(op.round, (round) =>
        round.categories.length >= MAX_CATS
          ? round
          : { ...round, categories: [...round.categories, blankCategory("NEW CATEGORY")] },
      );

    case "catDelete": {
      const r = game.rounds.findIndex((round) => round.categories.some((c) => c.id === op.catId));
      if (r === -1) return game;
      return withRound(r, (round) =>
        round.categories.length <= MIN_CATS
          ? round
          : { ...round, categories: round.categories.filter((c) => c.id !== op.catId) },
      );
    }

    case "catMove": {
      const r = game.rounds.findIndex((round) => round.categories.some((c) => c.id === op.catId));
      if (r === -1) return game;
      return withRound(r, (round) => {
        const i = round.categories.findIndex((c) => c.id === op.catId);
        const j = i + op.dir;
        if (j < 0 || j >= round.categories.length) return round;
        const categories = round.categories.slice();
        [categories[i], categories[j]] = [categories[j], categories[i]];
        return { ...round, categories };
      });
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
