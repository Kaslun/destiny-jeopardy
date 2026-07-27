/**
 * The authoritative game room: one Durable Object per room code.
 *
 * Everything that needs a single source of truth lives here — scores, which
 * clues are spent, and above all the buzz order. Buzzes are ranked by arrival
 * at this object, which is the only clock every player shares. Clients never
 * send timings; they just say "buzz" and the room decides who was first.
 *
 * State is broadcast as a whole snapshot on every change. The state is a few KB
 * at most, and full snapshots remove an entire category of desync bugs that
 * incremental patches invite.
 */

import { DurableObject } from "cloudflare:workers";
import { Server, routePartykitRequest, type Connection, type WSMessage } from "partyserver";
import {
  clueKey,
  emptyRoom,
  finalBounds,
  finalEligible,
  isSlug,
  parseGame,
  wagerBounds,
  type ClientMessage,
  type FinalEntry,
  type Role,
  type RoomState,
  type ServerMessage,
} from "../shared/protocol";

interface Env {
  JeopardyRoom: DurableObjectNamespace<JeopardyRoom>;
  BoardStore: DurableObjectNamespace<BoardStore>;
}

interface ConnMeta {
  role: Role;
  playerId: string | null;
}

const MAX_PLAYERS = 12;

export class JeopardyRoom extends Server<Env> {
  // Hibernation is off on purpose: while a game is running we *want* this
  // object resident, because it is the buzz authority. It costs us the idle
  // time between rounds and buys us a warm, consistent room all night.
  static options = { hibernate: false };

  #state: RoomState = emptyRoom();
  #meta = new Map<string, ConnMeta>();
  #loading: Promise<void> | null = null;

  /** Load persisted state once, even if several messages race on startup. */
  #ready(): Promise<void> {
    if (!this.#loading) {
      this.#loading = (async () => {
        const saved = await this.ctx.storage.get<RoomState>("state");
        if (saved) {
          // Connection-derived fields never survive an eviction; rebuild them
          // from the live sockets rather than trusting what was written.
          this.#state = {
            ...emptyRoom(),
            ...saved,
            hostConnected: false,
            players: (saved.players ?? []).map((p) => ({ ...p, connected: false })),
          };
        }
      })();
    }
    return this.#loading;
  }

  async onConnect(conn: Connection) {
    await this.#ready();
    this.#meta.set(conn.id, { role: "tv", playerId: null });
    this.#send(conn, { type: "state", state: this.#state, you: null });
  }

  async onClose(conn: Connection) {
    await this.#ready();
    const meta = this.#meta.get(conn.id);
    this.#meta.delete(conn.id);
    if (!meta) return;

    if (meta.playerId) {
      const player = this.#state.players.find((p) => p.id === meta.playerId);
      // Only mark away once every socket for that player is gone — a phone
      // reconnecting briefly opens a second connection before closing the first.
      if (player && !this.#hasLiveConn(meta.playerId)) player.connected = false;
    }
    this.#state.hostConnected = this.#anyRole("host");
    this.#commit();
  }

  async onMessage(conn: Connection, raw: WSMessage) {
    await this.#ready();
    if (typeof raw !== "string") return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      this.#send(conn, { type: "error", message: "malformed message" });
      return;
    }

    const meta = this.#meta.get(conn.id) ?? { role: "tv" as Role, playerId: null };

    // Anyone may identify themselves; everything else is gated below.
    if (msg.type === "join") {
      this.#handleJoin(conn, msg);
      return;
    }

    if (msg.type === "buzz") {
      this.#handleBuzz(meta);
      return;
    }

    // The wagering player sends this themselves; the host may also send it, for
    // when someone's phone has died and they call their bet out loud.
    if (msg.type === "setWager") {
      this.#handleWager(meta, msg.wager);
      return;
    }

    // Final-round input from players.
    if (msg.type === "setFinalWager" || msg.type === "setFinalResponse" || msg.type === "lockFinal") {
      this.#handleFinalInput(meta, msg);
      return;
    }

    if (msg.type === "rename") {
      const player = this.#state.players.find((p) => p.id === meta.playerId);
      if (player) {
        player.name = msg.name.slice(0, 24);
        player.cls = msg.cls.slice(0, 24);
        this.#commit();
      }
      return;
    }

    // ---- host-only from here down ----
    if (meta.role !== "host") {
      this.#send(conn, { type: "error", message: "only the host can do that" });
      return;
    }

    switch (msg.type) {
      case "setGame": {
        const game = parseGame(msg.game);
        if (!game) {
          this.#send(conn, { type: "error", message: "that game has no categories" });
          return;
        }
        this.#state.game = game;
        this.#resetBoard();
        break;
      }
      case "openClue": {
        const s = this.#state;
        const game = s.game;
        if (!game) return;
        if (s.final) return; // the board is closed once the final round starts
        const clue = game.categories[msg.c]?.clues[msg.r];
        if (!clue) return;
        if (s.used.includes(clueKey(msg.c, msg.r))) return;

        s.open = { c: msg.c, r: msg.r };
        s.buzzes = [];
        s.spent = [];
        s.revealed = false;

        if (clue.dd && s.players.length > 0) {
          // The clue belongs to whoever has control of the board — the last
          // player to answer correctly. With nobody established yet, fall to
          // the first seat and let the host reassign.
          const owner = s.players.find((p) => p.id === s.control) ?? s.players[0];
          s.phase = "wager";
          s.dd = { playerId: owner.id, wager: null, ...wagerBounds(owner.score, game.values) };
          // No clock during the wager — the timer starts when the clue shows.
          s.openedAt = null;
        } else {
          s.phase = "buzz";
          s.dd = null;
          s.openedAt = Date.now();
        }
        break;
      }
      case "setDDPlayer": {
        const s = this.#state;
        if (s.phase !== "wager" || !s.dd) return;
        const player = s.players.find((p) => p.id === msg.playerId);
        if (!player) return;
        s.dd = { playerId: player.id, wager: null, ...wagerBounds(player.score, s.game?.values ?? []) };
        break;
      }
      case "closeClue": {
        this.#closeClue();
        break;
      }
      case "reveal": {
        // Nothing to reveal while a wager is still being chosen.
        if (this.#state.phase === "wager") return;
        this.#state.revealed = msg.on;
        break;
      }
      case "judge": {
        this.#handleJudge(msg.correct);
        break;
      }
      case "adjust": {
        const player = this.#state.players.find((p) => p.id === msg.playerId);
        if (!player) return;
        player.score += msg.delta;
        break;
      }
      case "setLockout": {
        this.#state.lockout = msg.lockout;
        break;
      }
      case "resetBoard": {
        this.#resetBoard();
        break;
      }
      case "startFinal": {
        const s = this.#state;
        if (s.final) return;
        if (!s.game?.final) {
          this.#send(conn, { type: "error", message: "this game has no final clue" });
          return;
        }
        const eligible = finalEligible(s.players);
        if (eligible.length === 0) {
          this.#send(conn, { type: "error", message: "nobody is above zero — no final round" });
          return;
        }
        const entries: Record<string, FinalEntry> = {};
        for (const p of eligible) {
          entries[p.id] = { wager: null, response: "", locked: false, judged: null };
        }
        this.#closeClue();
        s.final = {
          phase: "wager",
          // Lowest score first, so the leader is revealed last.
          order: eligible.slice().sort((a, b) => a.score - b.score).map((p) => p.id),
          entries,
          revealIndex: 0,
        };
        break;
      }
      case "finalAdvance": {
        this.#advanceFinal();
        break;
      }
      case "judgeFinal": {
        this.#judgeFinal(msg.correct);
        break;
      }
      case "endFinal": {
        this.#state.final = null;
        break;
      }
      default:
        return;
    }
    this.#commit();
  }

  // ---- handlers ----

  #handleJoin(conn: Connection, msg: Extract<ClientMessage, { type: "join" }>) {
    const role: Role = msg.role === "host" || msg.role === "player" ? msg.role : "tv";
    let playerId: string | null = null;

    if (role === "player") {
      // A returning phone sends the id it stored locally, so a refresh keeps
      // its score and its seat instead of spawning a duplicate player.
      const existing = msg.playerId
        ? this.#state.players.find((p) => p.id === msg.playerId)
        : undefined;

      if (existing) {
        existing.connected = true;
        if (msg.name) existing.name = msg.name.slice(0, 24);
        if (msg.cls) existing.cls = msg.cls.slice(0, 24);
        playerId = existing.id;
      } else if (this.#state.players.length < MAX_PLAYERS) {
        const id = msg.playerId?.slice(0, 40) || crypto.randomUUID();
        this.#state.players.push({
          id,
          name: (msg.name || "GUARDIAN").slice(0, 24),
          cls: (msg.cls || "").slice(0, 24),
          score: 0,
          connected: true,
        });
        playerId = id;
      } else {
        this.#send(conn, { type: "error", message: "this room is full" });
      }
    }

    this.#meta.set(conn.id, { role, playerId });
    this.#state.hostConnected = this.#anyRole("host");
    this.#commit();
  }

  #handleWager(meta: ConnMeta, raw: number) {
    const s = this.#state;
    if (s.phase !== "wager" || !s.dd) return;

    const isOwner = !!meta.playerId && meta.playerId === s.dd.playerId;
    if (!isOwner && meta.role !== "host") return;

    const wager = Math.round(Number(raw));
    if (!Number.isFinite(wager)) return;

    // Clamped on the server. A phone could send anything at all.
    s.dd.wager = Math.max(s.dd.min, Math.min(s.dd.max, wager));
    s.phase = "live";
    s.openedAt = Date.now();
    this.#commit();
  }

  #handleFinalInput(
    meta: ConnMeta,
    msg: Extract<ClientMessage, { type: "setFinalWager" | "setFinalResponse" | "lockFinal" }>,
  ) {
    const s = this.#state;
    const final = s.final;
    if (!final || !meta.playerId) return;
    const entry = final.entries[meta.playerId];
    if (!entry) return; // not eligible for this round

    if (msg.type === "setFinalWager") {
      if (final.phase !== "wager") return;
      const player = s.players.find((p) => p.id === meta.playerId);
      if (!player) return;
      const { min, max } = finalBounds(player.score);
      const wager = Math.round(Number(msg.wager));
      if (!Number.isFinite(wager)) return;
      entry.wager = Math.max(min, Math.min(max, wager));
      entry.locked = true;
    } else if (msg.type === "setFinalResponse") {
      if (final.phase !== "clue") return;
      entry.response = String(msg.response).slice(0, 200);
    } else {
      // lockFinal: commit whichever stage the player is in.
      if (final.phase === "wager" && entry.wager === null) entry.wager = 0;
      entry.locked = true;
    }
    this.#commit();
  }

  /** The host's single "next" control through the final round. */
  #advanceFinal() {
    const s = this.#state;
    const final = s.final;
    if (!final) return;

    if (final.phase === "wager") {
      // Anyone who never got a wager in is treated as having risked nothing.
      for (const id of final.order) {
        const e = final.entries[id];
        if (e.wager === null) e.wager = 0;
        e.locked = false; // reused for "has committed a response"
      }
      final.phase = "clue";
      s.openedAt = Date.now();
      return;
    }

    if (final.phase === "clue") {
      final.phase = "reveal";
      final.revealIndex = 0;
      s.openedAt = null;
      return;
    }

    if (final.phase === "reveal") {
      if (final.revealIndex < final.order.length - 1) final.revealIndex++;
      else final.phase = "done";
      return;
    }
  }

  #judgeFinal(correct: boolean) {
    const s = this.#state;
    const final = s.final;
    if (!final || final.phase !== "reveal") return;
    const id = final.order[final.revealIndex];
    const entry = final.entries[id];
    if (!entry || entry.judged !== null) return; // already ruled on

    entry.judged = correct ? "correct" : "wrong";
    this.#addScore(id, correct ? (entry.wager ?? 0) : -(entry.wager ?? 0));
  }

  #handleBuzz(meta: ConnMeta) {
    const s = this.#state;
    if (!meta.playerId || !s.open || s.openedAt === null) return;
    if (s.phase !== "buzz") return; // a Daily Double is nobody else's to take
    if (s.spent.includes(meta.playerId)) return; // already got it wrong
    if (s.buzzes.some((b) => b.playerId === meta.playerId)) return; // double tap
    if (s.lockout === "first-only" && s.buzzes.length > 0) return; // room is locked

    s.buzzes.push({ playerId: meta.playerId, ms: Date.now() - s.openedAt });
    this.#commit();
  }

  #handleJudge(correct: boolean) {
    const s = this.#state;
    if (!s.open) return;

    // A Daily Double is one player's bet. It resolves in a single ruling and
    // the clue is finished either way — there is no queue to fall through to.
    if (s.dd) {
      if (s.phase !== "live" || s.dd.wager === null) return;
      this.#addScore(s.dd.playerId, correct ? s.dd.wager : -s.dd.wager);
      if (correct) s.control = s.dd.playerId;
      this.#closeClue();
      return;
    }

    const value = s.game?.values[s.open.r] ?? 0;
    const top = s.buzzes[0];

    if (correct) {
      if (top) {
        this.#addScore(top.playerId, value);
        s.control = top.playerId; // they pick the next clue
      }
      this.#closeClue();
      return;
    }

    if (top) {
      this.#addScore(top.playerId, -value);
      s.spent.push(top.playerId);
      s.buzzes.shift(); // the next player in the queue is now on the hook
    }
  }

  #addScore(playerId: string, delta: number) {
    const player = this.#state.players.find((p) => p.id === playerId);
    if (player) player.score += delta;
  }

  /**
   * Closing consumes the clue. Once it has been read aloud it cannot be put
   * back on the board, whether or not anyone answered it — that matches how
   * the game is actually played and stops a host reopening a burnt clue.
   */
  #closeClue() {
    const s = this.#state;
    if (s.open) {
      const key = clueKey(s.open.c, s.open.r);
      if (!s.used.includes(key)) s.used.push(key);
    }
    s.open = null;
    s.openedAt = null;
    s.phase = "buzz";
    s.dd = null;
    s.buzzes = [];
    s.spent = [];
    s.revealed = false;
  }

  #resetBoard() {
    const s = this.#state;
    s.final = null;
    s.used = [];
    s.open = null;
    s.openedAt = null;
    s.phase = "buzz";
    s.dd = null;
    s.control = null;
    s.buzzes = [];
    s.spent = [];
    s.revealed = false;
    for (const p of s.players) p.score = 0;
  }

  // ---- plumbing ----

  #hasLiveConn(playerId: string): boolean {
    for (const [, m] of this.#meta) if (m.playerId === playerId) return true;
    return false;
  }

  #anyRole(role: Role): boolean {
    for (const [, m] of this.#meta) if (m.role === role) return true;
    return false;
  }

  #send(conn: Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  /** Persist, then push a fresh snapshot to everyone with their own id attached. */
  #commit() {
    void this.ctx.storage.put("state", this.#state);
    for (const conn of this.getConnections()) {
      const meta = this.#meta.get(conn.id);
      this.#send(conn, {
        type: "state",
        state: this.#state,
        you: meta?.playerId ?? null,
      });
    }
  }
}

/**
 * The board library: one Durable Object per slug, holding a saved game.
 *
 * Boards are addressed by slug rather than listed. Anyone with the slug can
 * load it — that is the sharing mechanism — and the editor keeps its own local
 * index of the ones you made, since there is no cross-object listing.
 */
export class BoardStore extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET") {
      const game = await this.ctx.storage.get<unknown>("game");
      if (!game) return json({ error: "no board with that code" }, 404);
      return json({ game });
    }

    if (request.method === "PUT") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "body was not JSON" }, 400);
      }
      const game = parseGame((body as { game?: unknown })?.game ?? body);
      if (!game) return json({ error: "that game has no categories" }, 400);
      await this.ctx.storage.put("game", game);
      await this.ctx.storage.put("savedAt", Date.now());
      return json({ ok: true, game });
    }

    return json({ error: "method not allowed" }, 405);
  }
}

// The app is served from a different origin than this Worker, so the board
// routes need CORS. The WebSocket upgrade does not.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,PUT,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const board = url.pathname.match(/^\/boards\/([^/]+)$/);
    if (board) {
      const slug = decodeURIComponent(board[1]).toUpperCase();
      if (!isSlug(slug)) return json({ error: "bad board code" }, 400);
      const stub = env.BoardStore.get(env.BoardStore.idFromName(slug));
      return stub.fetch(new Request(url.origin + "/", request));
    }

    return (
      (await routePartykitRequest(request, env)) ??
      new Response("guardian-jeopardy room server", { status: 404 })
    );
  },
};
