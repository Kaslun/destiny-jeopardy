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
  t: string;
  a: string;
  dd?: boolean;
  media?: Media;
  mediaLabel?: string;
}

export interface Category {
  name: string;
  clues: Clue[];
}

/** The one clue everybody plays at once, at the end. */
export interface FinalClue {
  category: string;
  t: string;
  a: string;
}

export interface Game {
  title: string;
  subtitle: string;
  roomCode: string;
  values: number[];
  players?: { name: string; cls: string }[];
  categories: Category[];
  final?: FinalClue;
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
  /** Player ids in reveal order, lowest score first. Fixed when the round starts. */
  order: string[];
  entries: Record<string, FinalEntry>;
  /** Index into `order` of the player currently being revealed. */
  revealIndex: number;
}

export interface RoomState {
  game: Game | null;
  /** Non-null once the final round has started. */
  final: FinalRound | null;
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
  | { type: "resetBoard" }
  /** Host: begin the final round. */
  | { type: "startFinal" }
  /** Host: the single "next" control — wager → clue → reveal → next player → done. */
  | { type: "finalAdvance" }
  /** Host: abandon the final round and go back to the board. */
  | { type: "endFinal" }
  | { type: "setFinalWager"; wager: number }
  | { type: "setFinalResponse"; response: string }
  | { type: "lockFinal" }
  /** Host: rule on the player currently being revealed. */
  | { type: "judgeFinal"; correct: boolean };

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
    final: null,
    players: [],
    used: [],
    open: null,
    phase: "buzz",
    dd: null,
    control: null,
    openedAt: null,
    timerSeconds: 20,
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
      clues.push({
        t: String(q?.t ?? ""),
        a: String(q?.a ?? ""),
        ...(q?.dd ? { dd: true as const } : {}),
        ...(media ? { media, mediaLabel: String(q?.mediaLabel ?? "") } : {}),
      });
    }
    return { name: String(c?.name ?? ""), clues };
  });

  const values =
    Array.isArray(g.values) && g.values.length === ROWS
      ? g.values.map((v) => Number(v) || 0)
      : [200, 400, 600, 800, 1000];

  const f = g.final as Partial<FinalClue> | undefined;
  const final: FinalClue | undefined =
    f && (String(f.t ?? "").trim() || String(f.a ?? "").trim())
      ? { category: String(f.category ?? ""), t: String(f.t ?? ""), a: String(f.a ?? "") }
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
  };
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
