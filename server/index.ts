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

import { Server, routePartykitRequest, type Connection, type WSMessage } from "partyserver";
import {
  applyBoardOp,
  boardExhausted,
  clueKey,
  emptyRoom,
  formatBytes,
  finalBounds,
  finalEligible,
  isSlug,
  isTimed,
  isUploaded,
  MAX_BOARD_BYTES,
  MAX_MEDIA_BYTES,
  parseGame,
  readSecondsFor,
  ROOM_TTL_MS,
  roundOf,
  secondsFor,
  standings,
  STORAGE_BUDGET_BYTES,
  wagerBounds,
  type BoardClientMessage,
  type BoardServerMessage,
  type ClientMessage,
  type EditorPresence,
  type FinalEntry,
  type Game,
  type Role,
  type RoomState,
  type ServerMessage,
  type StorageUsage,
} from "../shared/protocol";

interface Env {
  JeopardyRoom: DurableObjectNamespace<JeopardyRoom>;
  BoardStore: DurableObjectNamespace<BoardStore>;
  StorageMeter: DurableObjectNamespace<StorageMeter>;
  MEDIA: R2Bucket;
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
  #lastActivity = 0;
  /** Player ids the host has removed. See {@link JeopardyRoom.kick}. */
  #kicked = new Set<string>();
  /**
   * The secret that drives this room, set by whoever opened it first.
   *
   * Kept out of `RoomState` on purpose: state is broadcast to every screen in
   * the room, and a key in there would be readable by every phone present.
   */
  #hostKey: string | null = null;

  /**
   * Discard a room nobody has touched for {@link ROOM_TTL_MS}.
   *
   * Checked on every connection rather than only on load: with hibernation off
   * this object stays resident for as long as anything is open, so a load-time
   * check would simply never run again. The guarantee that matters is that an
   * old room code hands you a clean room, not a half-played game from last week.
   */
  #expireIfStale(): boolean {
    if (this.#lastActivity === 0) return false;
    if (Date.now() - this.#lastActivity < ROOM_TTL_MS) return false;

    console.info(`[room] expired after ${Math.round((Date.now() - this.#lastActivity) / 60000)} min idle`);
    this.#state = emptyRoom();
    this.#meta.clear();
    this.#lastActivity = 0;
    // The claim expires with the room. An old code must hand you a clean room
    // you can actually host, not one owned by a browser from last week.
    this.#hostKey = null;
    this.#kicked.clear();
    this.ctx.waitUntil(this.ctx.storage.delete(["state", "lastActivity", "hostKey"]));
    return true;
  }

  /** Load persisted state once, even if several messages race on startup. */
  #ready(): Promise<void> {
    if (!this.#loading) {
      this.#loading = (async () => {
        const saved = await this.ctx.storage.get<RoomState>("state");
        this.#lastActivity = (await this.ctx.storage.get<number>("lastActivity")) ?? 0;
        this.#hostKey = (await this.ctx.storage.get<string>("hostKey")) ?? null;

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
    this.#expireIfStale();
    this.#meta.set(conn.id, { role: "tv", playerId: null });
    this.#send(conn, {
      type: "state",
      state: { ...this.#state, claimed: this.#hostKey !== null, youAreHost: false },
      you: null,
    });
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
        if (typeof msg.tint === "number" && Number.isFinite(msg.tint)) {
          // Clamped, not validated against a list: the client knows how many
          // tints its theme has and the server has no business shipping that
          // table just to reject an out-of-range number.
          player.tint = Math.max(0, Math.min(11, Math.round(msg.tint)));
        }
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
        if (!s.started) return; // the board is closed while the room is in the lobby
        if (s.final || s.results) return; // and once the final round or standings begin
        const board = roundOf(game, s.round);
        const clue = board?.categories[msg.c]?.clues[msg.r];
        if (!clue) return;
        if (s.used.includes(clueKey(s.round, msg.c, msg.r))) return;

        s.open = { c: msg.c, r: msg.r };
        s.buzzes = [];
        s.spent = [];
        s.revealed = false;
        s.resolved = false;

        // Whatever this clue is worth in time — its own setting, else the
        // board's, else the fallback. Every screen reads it from here.
        s.timerSeconds = secondsFor(game, clue);
        s.timed = isTimed(clue);
        s.readSeconds = readSecondsFor(game, clue);

        if (clue.dd && s.players.length === 0) {
          // Without a player there is nobody to wager, so this would quietly
          // become an ordinary clue and score nothing. Say so rather than
          // letting the host wonder why the Daily Double did nothing.
          this.#send(conn, {
            type: "error",
            message: "this is a Daily Double, but nobody has joined yet — it will play as a normal clue",
          });
        }

        if (clue.dd && s.players.length > 0) {
          // The clue belongs to whoever has control of the board — the last
          // player to answer correctly. With nobody established yet, fall to
          // the first seat and let the host reassign.
          const owner = s.players.find((p) => p.id === s.control) ?? s.players[0];
          s.phase = "wager";
          s.dd = { playerId: owner.id, wager: null, ...wagerBounds(owner.score, board.values) };
          // No clock during the wager — the timer starts when the clue shows.
          s.openedAt = null;
          s.shownAt = null;
        } else {
          s.phase = "buzz";
          s.dd = null;
          // The buzzers open once the clue has had time to be read. Scheduled
          // as a future instant rather than kicked off by a timer: this object
          // has no alarm to miss, every screen counts down to the same number,
          // and a buzz is judged against it on arrival.
          s.shownAt = Date.now();
          s.openedAt = s.shownAt + s.readSeconds * 1000;
        }
        break;
      }
      case "setDDPlayer": {
        const s = this.#state;
        if (s.phase !== "wager" || !s.dd) return;
        const player = s.players.find((p) => p.id === msg.playerId);
        if (!player) return;
        s.dd = {
          playerId: player.id,
          wager: null,
          ...wagerBounds(player.score, roundOf(s.game, s.round)?.values ?? []),
        };
        break;
      }
      case "closeClue": {
        this.#closeClue();
        // Only here, not inside `#closeClue` itself — that is also called by
        // returning to the lobby, starting the final round and opening the
        // standings, none of which should trigger a round change on the way
        // past.
        this.#advanceIfBoardExhausted();
        break;
      }
      case "setRound": {
        const s = this.#state;
        if (!s.game) return;
        if (msg.index < 0 || msg.index >= s.game.rounds.length) return;
        if (s.final || s.results) return;
        // Deliberately does not clear `used`: stepping back to an earlier round
        // should show what was already played there, not offer it again. The
        // keys are round-scoped precisely so this works.
        this.#closeClue();
        s.round = msg.index;
        break;
      }
      case "setControl": {
        const s = this.#state;
        if (msg.playerId === null) {
          s.control = null;
          break;
        }
        if (!s.players.some((p) => p.id === msg.playerId)) return;
        s.control = msg.playerId;
        break;
      }
      case "openBuzzers": {
        const s = this.#state;
        // Only ever brings the moment forward. Sending it after the buzzers
        // are already open would otherwise restart the clue's clock and hand
        // the room a second helping of time.
        if (!s.open || s.phase !== "buzz" || s.openedAt === null) return;
        if (Date.now() >= s.openedAt) return;
        s.openedAt = Date.now();
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
      case "kick": {
        this.#kick(msg.playerId);
        break;
      }
      case "setLockout": {
        this.#state.lockout = msg.lockout;
        break;
      }
      case "startGame": {
        const s = this.#state;
        if (!s.game) {
          this.#send(conn, { type: "error", message: "load a board before starting" });
          return;
        }
        s.started = true;
        break;
      }
      case "returnToLobby": {
        // Scores and the board survive; only the live clue is cleared.
        this.#closeClue();
        this.#state.results = null;
        this.#state.started = false;
        break;
      }
      case "resetBoard": {
        this.#resetBoard();
        break;
      }
      case "startFinal": {
        const s = this.#state;
        if (s.final || !s.started) return;
        if (!s.game?.final) {
          this.#send(conn, { type: "error", message: "this game has no final clue" });
          return;
        }
        if (finalEligible(s.players).length === 0) {
          this.#send(conn, { type: "error", message: "nobody is above zero — no final round" });
          return;
        }
        this.#startFinal();
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
      case "closeFinalWriting": {
        const final = this.#state.final;
        if (!final || final.phase !== "clue") return;
        final.writingClosed = true;
        break;
      }
      case "endFinal": {
        this.#state.final = null;
        break;
      }
      case "showResults": {
        const s = this.#state;
        if (!s.started) return;
        if (s.players.length === 0) {
          this.#send(conn, { type: "error", message: "nobody has played — there is nothing to reveal" });
          return;
        }
        this.#closeClue();
        // Worst first: the standings count up to the winner.
        s.results = {
          order: standings(s.players).map((p) => p.id).reverse(),
          revealed: 0,
        };
        break;
      }
      case "revealNextPlace": {
        const r = this.#state.results;
        if (!r) return;
        if (r.revealed < r.order.length) r.revealed++;
        break;
      }
      case "endResults": {
        this.#state.results = null;
        break;
      }
      case "closeRoom": {
        await this.#closeRoom();
        return; // nothing left to broadcast — the room is gone
      }
      default:
        return;
    }
    this.#commit();
  }

  // ---- handlers ----

  #handleJoin(conn: Connection, msg: Extract<ClientMessage, { type: "join" }>) {
    let role: Role = msg.role === "host" || msg.role === "player" ? msg.role : "tv";
    let playerId: string | null = null;

    // Claiming the room. The first host to arrive with a key owns it; everyone
    // after that must present the same one. Demoted rather than disconnected,
    // so someone who opens the host URL out of curiosity gets a read-only
    // console with an explanation, not a dead page.
    if (role === "host") {
      const key = typeof msg.hostKey === "string" ? msg.hostKey.slice(0, 64) : "";
      if (!key) {
        role = "tv";
        this.#send(conn, { type: "error", message: "this room already has a host" });
      } else if (this.#hostKey === null) {
        this.#hostKey = key;
        this.ctx.waitUntil(this.ctx.storage.put("hostKey", key));
      } else if (this.#hostKey !== key) {
        role = "tv";
        this.#send(conn, {
          type: "error",
          message: "this room already has a host — you are watching, not driving",
        });
      }
    }

    if (role === "player" && msg.playerId && this.#kicked.has(msg.playerId)) {
      this.#send(conn, { type: "error", message: "you have been removed from this room" });
      this.#meta.set(conn.id, { role: "tv", playerId: null });
      return;
    }

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
      } else {
        // Make room by dropping people who have already left. Without this a
        // roster silently fills with ghosts from earlier sessions on the same
        // code, and the next real player is told the room is full.
        if (this.#state.players.length >= MAX_PLAYERS) {
          this.#state.players = this.#state.players.filter((p) => p.connected);
        }
      }

      if (existing) {
        /* handled above */
      } else if (this.#state.players.length < MAX_PLAYERS) {
        const id = msg.playerId?.slice(0, 40) || crypto.randomUUID();
        this.#state.players.push({
          id,
          // The client sends nothing until the player has typed a name, and it
          // cannot fill the blank itself — the wording belongs to the board's
          // theme, which arrives over this same connection.
          name: (msg.name || "PLAYER").slice(0, 24),
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

  /**
   * Remove a player and keep them out.
   *
   * The id is remembered, because the phone stores it and would otherwise walk
   * straight back in on the next reconnect — a "kick" that lasts one second is
   * worse than none, since the host thinks it worked. Held in memory rather
   * than in room state: hibernation is off, so the room stays resident for the
   * evening, and a kick is not something that should outlive the game.
   *
   * Anything they were part of goes with them — a live buzz, a queue place, a
   * Daily Double that was theirs to answer.
   */
  #kick(playerId: string) {
    const s = this.#state;
    if (!s.players.some((p) => p.id === playerId)) return;

    this.#kicked.add(playerId);
    s.players = s.players.filter((p) => p.id !== playerId);
    s.buzzes = s.buzzes.filter((b) => b.playerId !== playerId);
    s.spent = s.spent.filter((id) => id !== playerId);
    if (s.control === playerId) s.control = null;
    if (s.final) {
      delete s.final.entries[playerId];
      const at = s.final.order.indexOf(playerId);
      if (at !== -1) {
        s.final.order.splice(at, 1);
        // Keep the reveal pointer on the same *person*, not the same slot.
        if (at < s.final.revealIndex) s.final.revealIndex--;
      }
      s.final.revealIndex = Math.min(s.final.revealIndex, Math.max(0, s.final.order.length - 1));
    }
    if (s.results) {
      s.results.order = s.results.order.filter((id) => id !== playerId);
      s.results.revealed = Math.min(s.results.revealed, s.results.order.length);
    }
    // A Daily Double belonging to nobody cannot be answered, so it ends.
    if (s.dd?.playerId === playerId) this.#closeClue();

    for (const conn of this.getConnections()) {
      if (this.#meta.get(conn.id)?.playerId !== playerId) continue;
      this.#meta.delete(conn.id);
      try {
        conn.close(4001, "removed from the room");
      } catch {
        /* already gone */
      }
    }
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
    // No read delay on a Daily Double: there is no buzzer race to protect, only
    // one player may answer, and they have been staring at the category since
    // the wager began. Zeroed rather than merely ignored — every screen derives
    // its own countdown from this field, and a leftover value from the clue's
    // own settings would have them all waiting for a gate that is already open.
    s.readSeconds = 0;
    s.shownAt = Date.now();
    s.openedAt = s.shownAt;
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
      if (final.phase !== "clue" || final.writingClosed) return;
      // Late writing is refused on the room's own clock, checked on arrival, so
      // there is no window where an answer slips in after time.
      if (s.timed && s.openedAt !== null && Date.now() - s.openedAt > s.timerSeconds * 1000) {
        final.writingClosed = true;
        this.#commit();
        return;
      }
      entry.response = String(msg.response).slice(0, 200);

      // Everyone has written something: stop the clock early rather than
      // making the room sit through the rest of the music.
      if (final.order.every((id) => final.entries[id].response.trim() !== "")) {
        final.writingClosed = true;
      }
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
      s.timerSeconds = secondsFor(s.game, s.game?.final ?? null);
      s.timed = isTimed(s.game?.final ?? null);
      s.readSeconds = readSecondsFor(s.game, s.game?.final ?? null);
      // The writing clock starts once the clue has been read, exactly as the
      // buzzers do — everybody should be answering the same question, not
      // racing whoever reads fastest off the screen.
      s.shownAt = Date.now();
      s.openedAt = s.shownAt + s.readSeconds * 1000;
      return;
    }

    if (final.phase === "clue") {
      final.phase = "reveal";
      final.revealIndex = 0;
      s.openedAt = null;
      s.shownAt = null;
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
    this.#noteRuling(correct);
  }

  #handleBuzz(meta: ConnMeta) {
    const s = this.#state;
    if (!meta.playerId || !s.open || s.openedAt === null) return;
    if (s.phase !== "buzz") return; // a Daily Double is nobody else's to take
    if (s.resolved) return; // already settled; the clue is only still up to be read
    // Too early: the clue is still being read. Refused here rather than merely
    // greyed out on the phone, because a disabled button is a suggestion and
    // this is a rule — someone with the tab open from the last clue would
    // otherwise land a buzz before anyone else had heard the question.
    if (Date.now() < s.openedAt) return;
    // Time is up: the buzzer closes. Checked here rather than on a timer, so
    // there is no window where a late buzz slips in before an alarm fires.
    // An untimed clue never closes — the host decides when to move on.
    if (s.timed && Date.now() - s.openedAt > s.timerSeconds * 1000) return;
    if (s.spent.includes(meta.playerId)) return; // already got it wrong
    if (s.buzzes.some((b) => b.playerId === meta.playerId)) return; // double tap
    if (s.lockout === "first-only" && s.buzzes.length > 0) return; // room is locked

    s.buzzes.push({ playerId: meta.playerId, ms: Date.now() - s.openedAt });
    this.#commit();
  }

  #handleJudge(correct: boolean) {
    const s = this.#state;
    if (!s.open) return;
    if (s.resolved) return; // already settled — the clue is only still up to be read

    // A Daily Double is one player's bet. It resolves in a single ruling and
    // the clue is finished either way — there is no queue to fall through to.
    if (s.dd) {
      if (s.phase !== "live" || s.dd.wager === null) return;
      this.#addScore(s.dd.playerId, correct ? s.dd.wager : -s.dd.wager);
      if (correct) s.control = s.dd.playerId;
      this.#noteRuling(correct);
      this.#resolveClue();
      return;
    }

    const value = roundOf(s.game, s.round)?.values[s.open.r] ?? 0;
    const top = s.buzzes[0];

    if (correct) {
      if (top) {
        this.#addScore(top.playerId, value);
        s.control = top.playerId; // they pick the next clue
        this.#noteRuling(true);
      }
      this.#resolveClue();
      return;
    }

    if (top) {
      this.#addScore(top.playerId, -value);
      s.spent.push(top.playerId);
      s.buzzes.shift(); // the next player in the queue is now on the hook
      this.#noteRuling(false);
    }

    // Nobody is left to take it. The clue is over whether or not it was ever
    // answered, so show the room what it was rather than closing on a shrug.
    if (s.buzzes.length === 0 && this.#everyoneSpent()) this.#resolveClue();
  }

  /** Has every connected player already had their go at the open clue? */
  #everyoneSpent(): boolean {
    const live = this.#state.players.filter((p) => p.connected);
    return live.length > 0 && live.every((p) => this.#state.spent.includes(p.id));
  }

  /**
   * Settle the open clue without taking it off the screen.
   *
   * A correct answer used to close the clue instantly, which snapped the room
   * back to the board before anyone had heard what the answer actually was —
   * the one moment everybody is waiting for. So a ruling now reveals it and
   * stops there; moving on is a separate, deliberate act by the host.
   */
  #resolveClue() {
    const s = this.#state;
    s.resolved = true;
    s.revealed = true;
    // The clock stops mattering the moment the clue is settled, and a bar still
    // draining behind a revealed answer reads as though time were still on.
    s.timed = false;
  }

  /** Record a verdict so every screen can react without inferring it. */
  #noteRuling(correct: boolean) {
    const seq = (this.#state.lastRuling?.seq ?? 0) + 1;
    this.#state.lastRuling = { correct, seq };
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
      const key = clueKey(s.round, s.open.c, s.open.r);
      if (!s.used.includes(key)) s.used.push(key);
    }
    s.open = null;
    s.openedAt = null;
    s.shownAt = null;
    s.phase = "buzz";
    s.dd = null;
    s.buzzes = [];
    s.spent = [];
    s.revealed = false;
    s.resolved = false;
    s.timed = true;
  }

  /** Open the final round. Shared by the host's button and board exhaustion. */
  #startFinal() {
    const s = this.#state;
    const eligible = finalEligible(s.players);
    if (eligible.length === 0) return;
    const entries: Record<string, FinalEntry> = {};
    for (const p of eligible) {
      entries[p.id] = { wager: null, response: "", locked: false, judged: null };
    }
    this.#closeClue();
    s.final = {
      phase: "wager",
      writingClosed: false,
      // Lowest score first, so the leader is revealed last.
      order: eligible.slice().sort((a, b) => a.score - b.score).map((p) => p.id),
      entries,
      revealIndex: 0,
    };
  }

  /**
   * The last clue of a round has been played — move the game on.
   *
   * An empty board is not a state anyone wants to sit in: there is nothing left
   * to pick, and the host would otherwise have to notice and press the right
   * button. So the room walks itself forward — round one to round two, and off
   * the last round into the final. The host can still step back with the round
   * controls, or abandon the final round.
   *
   * Scores and board control survive a round change. Only the grid is new.
   */
  #advanceIfBoardExhausted() {
    const s = this.#state;
    if (!s.started || s.final || s.results) return;
    if (!boardExhausted(s.game, s.round, s.used)) return;

    if (s.round + 1 < (s.game?.rounds.length ?? 0)) {
      s.round++;
      return;
    }

    if (!s.game?.final) return; // no final clue authored — leave them on the board
    if (finalEligible(s.players).length === 0) return; // nobody in the black
    this.#startFinal();
  }

  #resetBoard() {
    const s = this.#state;
    s.final = null;
    s.results = null;
    s.used = [];
    s.open = null;
    s.openedAt = null;
    s.shownAt = null;
    s.phase = "buzz";
    s.dd = null;
    s.control = null;
    s.round = 0;
    s.buzzes = [];
    s.spent = [];
    s.revealed = false;
    s.resolved = false;
    s.timed = true;
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

  /**
   * Wipe the room so its code behaves like a brand new one.
   *
   * Connections are closed rather than left hanging: anything still open
   * reconnects and re-announces itself, so a room closed while phones are still
   * on screen repopulates honestly instead of stranding them against a player
   * record that no longer exists.
   */
  async #closeRoom() {
    // Named keys, not deleteAll(): PartyServer keeps its own records in here
    // (including the name it needs to recover an alarm) and wiping those breaks
    // the room's expiry afterwards.
    await this.ctx.storage.delete(["state", "lastActivity"]);
    await this.ctx.storage.deleteAlarm();
    this.#state = emptyRoom();
    this.#meta.clear();
    // A wiped room forgives everyone: the code is meant to behave like a brand
    // new one, and that includes letting anybody back in.
    this.#kicked.clear();
    this.#loading = null; // a later access re-reads and finds nothing
    for (const conn of this.getConnections()) {
      try {
        conn.close(1000, "room closed");
      } catch {
        /* already gone */
      }
    }
  }

  /**
   * Persist state, stamp the room as used, and keep an expiry alarm pending.
   *
   * Held open with `waitUntil` rather than fired and forgotten: a bare
   * `void`-ed chain of awaits gets cancelled when the request's I/O context
   * closes, which silently dropped `lastActivity` and left every room
   * unexpirable.
   */
  async #persist() {
    try {
      const now = Date.now();
      // Kept in memory as well as in storage: this object stays warm between
      // sessions, so the staleness check would otherwise keep reading the value
      // loaded on first wake — usually 0 — and never expire anything.
      this.#lastActivity = now;
      await this.ctx.storage.put("state", this.#state);
      await this.ctx.storage.put("lastActivity", now);
    } catch (err) {
      // Housekeeping must never take a live game down with it.
      console.error("[room] could not persist", err);
    }
  }

  /**
   * Persist, then push a fresh snapshot to everyone.
   *
   * Two fields are per-recipient rather than part of the shared truth: your own
   * player id, and whether *you* are the host. Both are answers to "who am I",
   * which is necessarily a different answer down every socket.
   */
  #commit() {
    this.ctx.waitUntil(this.#persist());
    const claimed = this.#hostKey !== null;
    for (const conn of this.getConnections()) {
      const meta = this.#meta.get(conn.id);
      this.#send(conn, {
        type: "state",
        state: { ...this.#state, claimed, youAreHost: meta?.role === "host" },
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
 *
 * It is also the collaboration server. Editors connect over WebSocket and send
 * operations; this object owns the document, applies them in arrival order, and
 * broadcasts the result. Because it is a single object per board, "arrival
 * order" is a real total order — there is no second writer to reconcile with.
 * The plain GET/PUT API stays for the host console, which only ever wants a
 * whole board.
 */
export class BoardStore extends Server<Env> {
  static options = { hibernate: false };

  #game: Game | null = null;
  #presence = new Map<string, EditorPresence>();
  #loaded = false;
  #lastSweep = 0;
  /**
   * The secret that permits writing to this board.
   *
   * Reading stays open — a code is how you share a board with whoever is
   * hosting, and gating that would break the one workflow this thing has. It is
   * *overwriting* that needs protecting, because a guessed code should not be
   * able to flatten someone's evening of work.
   *
   * Null on boards created before this existed. The first writer to present a
   * key claims them, which upgrades every old board the next time its author
   * opens it, and needs no migration.
   */
  #editKey: string | null = null;
  /** Per-connection write access, decided at `hello`. */
  #writers = new Map<string, boolean>();

  async onStart() {
    await this.#load();
  }

  async #ready() {
    if (!this.#loaded) await this.#load();
  }

  /**
   * Boards saved before collaborative editing existed have no ids on their
   * categories and clues, and every edit operation addresses them by id. So
   * everything is normalised on the way in and written back once, which
   * backfills those ids permanently instead of regenerating them each wake.
   */
  async #load() {
    const stored = await this.ctx.storage.get<Game>("game");
    this.#editKey = (await this.ctx.storage.get<string>("editKey")) ?? null;
    this.#loaded = true;
    if (!stored) {
      this.#game = null;
      return;
    }
    // Boards saved before rounds existed have no `rounds` array, and boards
    // saved before collaborative editing have no ids on their categories and
    // clues. Both are normalised on the way in and written back once, so the
    // upgrade happens exactly as often as a board is opened rather than every
    // time it wakes.
    const stale =
      !Array.isArray((stored as { rounds?: unknown }).rounds) ||
      stored.rounds.some((r) => !r.id || r.categories.some((c) => !c.id || c.clues.some((q) => !q.id)));
    this.#game = stale ? (parseGame(stored) ?? stored) : stored;
    if (stale && this.#game) await this.#persist();

    // Not awaited: nobody should wait on housekeeping to open a board.
    void this.#sweepOrphans();
  }

  async onConnect(conn: Connection) {
    await this.#ready();
    if (!this.#game) {
      conn.send(JSON.stringify({ type: "error", message: "no board with that code" }));
      conn.close(1008, "unknown board");
      return;
    }
    this.#presence.set(conn.id, {
      id: conn.id,
      name: "EDITOR",
      color: EDITOR_COLORS[this.#presence.size % EDITOR_COLORS.length],
      focus: null,
    });
    conn.send(
      JSON.stringify({
        type: "board",
        game: this.#game,
        editors: this.#editors(),
        you: conn.id,
      } satisfies BoardServerMessage),
    );
    this.#broadcastEditors();

    // Opening a board is a natural moment to tidy up behind it.
    void this.#sweepOrphans();
  }

  async onClose(conn: Connection) {
    this.#presence.delete(conn.id);
    this.#writers.delete(conn.id);
    this.#broadcastEditors();
  }

  async onMessage(conn: Connection, raw: WSMessage) {
    await this.#ready();
    if (typeof raw !== "string" || !this.#game) return;

    let msg: BoardClientMessage;
    try {
      msg = JSON.parse(raw) as BoardClientMessage;
    } catch {
      return;
    }

    const me = this.#presence.get(conn.id);
    if (!me) return;

    if (msg.type === "hello") {
      me.name = String(msg.name).slice(0, 24) || "EDITOR";
      const canEdit = await this.#mayWrite(typeof msg.key === "string" ? msg.key.slice(0, 64) : null);
      this.#writers.set(conn.id, canEdit);
      conn.send(JSON.stringify({ type: "access", canEdit } satisfies BoardServerMessage));
      this.#broadcastEditors();
      return;
    }

    if (msg.type === "focus") {
      me.focus = msg.focus ?? null;
      this.#broadcastEditors();
      return;
    }

    if (msg.type === "op") {
      // Checked on every operation rather than only at the door: a client that
      // never said hello, or one that reconnected, must not inherit somebody
      // else's write access.
      if (!this.#writers.get(conn.id)) {
        conn.send(
          JSON.stringify({
            type: "error",
            message: "this board is read-only for you — you need its edit link",
          } satisfies BoardServerMessage),
        );
        return;
      }
      const next = applyBoardOp(this.#game, msg.op);
      if (next === this.#game) return; // op was a no-op; don't churn everyone
      const before = mediaKeysIn(this.#game);
      this.#game = msg.op.type === "replace" ? (parseGame(next) ?? this.#game) : next;
      await this.#persist();
      await this.#dropOrphans(before);
      this.broadcast(
        JSON.stringify({
          type: "board",
          game: this.#game,
          editors: this.#editors(),
          you: "",
        } satisfies BoardServerMessage),
      );
    }
  }

  /** Plain HTTP, for the host console and for creating a board from a draft. */
  async onRequest(request: Request): Promise<Response> {
    await this.#ready();

    // Uploads are routed through this object rather than handled at the edge,
    // so that "may this caller write to this board?" is answered in exactly one
    // place. Storing a file against a board is a write like any other.
    // "May this key write to this board?", asked without the file attached.
    //
    // The upload itself is *not* routed through this object. Handing a Durable
    // Object a request whose body is a 40 MB stream and answering it without
    // reading that stream — which is exactly what a refusal does — leaves the
    // client pushing bytes at a response that has already been sent. The
    // runtime treats that as an uncaught error and the object starts 503ing, so
    // a single unauthorised upload would take the board down for everyone.
    // Asking first keeps the body out of it entirely.
    if (new URL(request.url).pathname === "/authorize" && request.method === "POST") {
      const key = request.headers.get("x-edit-key");
      const ok = await this.#mayWrite(key ? key.slice(0, 64) : null);
      return json(ok ? { ok: true } : { error: "this board belongs to someone else" }, ok ? 200 : 403);
    }

    if (request.method === "GET") {
      if (!this.#game) return json({ error: "no board with that code" }, 404);
      return json({ game: this.#game });
    }

    if (request.method === "PUT") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "body was not JSON" }, 400);
      }
      const key = (body as { key?: unknown })?.key;
      if (!(await this.#mayWrite(typeof key === "string" ? key.slice(0, 64) : null))) {
        return json({ error: "this board belongs to someone else" }, 403);
      }
      const game = parseGame((body as { game?: unknown })?.game ?? body);
      if (!game) return json({ error: "that game has no categories" }, 400);
      const before = mediaKeysIn(this.#game);
      this.#game = game;
      await this.#persist();
      await this.#dropOrphans(before);
      // Anyone with the board open should see an outside overwrite immediately.
      this.broadcast(
        JSON.stringify({
          type: "board",
          game,
          editors: this.#editors(),
          you: "",
        } satisfies BoardServerMessage),
      );
      return json({ ok: true, game });
    }

    return json({ error: "method not allowed" }, 405);
  }

  /**
   * Files belonging to this board. Media is only ever deleted from under this
   * prefix, so a board that imported another board's JSON — and therefore
   * points at someone else's files — can never delete them.
   */
  #prefix(): string {
    return `boards/${this.name}/`;
  }

  /**
   * Whether this key may write to the board, claiming it if it is unowned.
   *
   * Trust-on-first-use: an unclaimed board belongs to the next person who
   * writes to it holding a key. That is weaker than issuing the key at creation
   * time, and it is the deliberate price of not breaking every board that
   * already exists.
   */
  async #mayWrite(key: string | null): Promise<boolean> {
    if (!key) return false;
    if (this.#editKey === null) {
      this.#editKey = key;
      await this.ctx.storage.put("editKey", key);
      return true;
    }
    return this.#editKey === key;
  }

  /**
   * Delete whatever the document stopped pointing at.
   *
   * Diffing references before and after a change catches every route a file can
   * be dropped by — removed, replaced, the clue cleared, switched back to a
   * placeholder, its category deleted, or the whole board replaced by an import
   * — without each of those having to remember to clean up after itself.
   */
  async #dropOrphans(before: Set<string>) {
    const after = mediaKeysIn(this.#game);
    const gone = [...before].filter((key) => !after.has(key) && key.startsWith(this.#prefix()));
    if (!gone.length) return;
    try {
      await this.env.MEDIA.delete(gone);
    } catch (err) {
      // A failed delete costs storage, not correctness — never fail the edit.
      console.error("[media] could not delete orphans", err);
    }
    // Freeing space must reach the shared counter, or the budget only ever
    // grows and deleting media stops helping.
    await this.#recount();
  }

  /**
   * Catch files no diff could have seen: uploads whose attaching edit never
   * arrived, and anything orphaned before this cleanup existed. The age guard
   * is what makes it safe — a file uploaded seconds ago may simply be waiting
   * for its operation to land.
   */
  async #sweepOrphans() {
    // Throttled rather than tied to cold starts alone: this object stays warm
    // for as long as anyone has the board open, so a load-only sweep would
    // almost never run during the session where the orphans are created.
    if (Date.now() - this.#lastSweep < SWEEP_THROTTLE_MS) return;
    this.#lastSweep = Date.now();
    try {
      const referenced = mediaKeysIn(this.#game);
      const cutoff = Date.now() - ORPHAN_GRACE_MS;
      const listed = await this.env.MEDIA.list({ prefix: this.#prefix() });
      const stale = listed.objects
        .filter((o) => !referenced.has(o.key) && o.uploaded.getTime() < cutoff)
        .map((o) => o.key);
      if (stale.length) {
        await this.env.MEDIA.delete(stale);
        console.info(`[media] swept ${stale.length} orphaned file(s) from ${this.#prefix()}`);
      }
      // Already holding a full listing, so the true size is free to compute.
      const kept = listed.objects.filter((o) => !stale.includes(o.key));
      await this.#reportUsage(kept.reduce((sum, o) => sum + o.size, 0));
    } catch (err) {
      console.error("[media] sweep failed", err);
    }
  }

  /**
   * Tell the meter what this board actually occupies.
   *
   * The figure comes from a bucket listing rather than from arithmetic on what
   * we think we uploaded, so the shared counter is corrected every time a board
   * changes. Failures are swallowed: a board must stay editable whether or not
   * the accounting is reachable.
   */
  async #reportUsage(bytes: number) {
    try {
      await meterStub(this.env).fetch("https://meter/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: this.name, bytes }),
      });
    } catch (err) {
      console.error("[quota] could not report usage", err);
    }
  }

  /** Recount from R2 and report. Used after a change that deleted files. */
  async #recount() {
    try {
      const listed = await this.env.MEDIA.list({ prefix: this.#prefix() });
      await this.#reportUsage(listed.objects.reduce((sum, o) => sum + o.size, 0));
    } catch (err) {
      console.error("[quota] could not recount", err);
    }
  }

  #editors(): EditorPresence[] {
    return [...this.#presence.values()];
  }

  #broadcastEditors() {
    this.broadcast(
      JSON.stringify({ type: "editors", editors: this.#editors() } satisfies BoardServerMessage),
    );
  }

  async #persist() {
    await this.ctx.storage.put("game", this.#game);
    await this.ctx.storage.put("savedAt", Date.now());
  }
}

/**
 * The storage budget, in one place.
 *
 * There is exactly one of these objects for the whole deployment, because a
 * budget shared between boards can only be enforced by something that can see
 * all of them. It holds a per-board byte count and their sum.
 *
 * The counter is a cache, not the truth — R2 is. Each board recomputes its own
 * size from a bucket listing whenever it changes and reports the real figure,
 * so a missed increment, a failed delete or an upload that died halfway is
 * corrected on the next edit rather than accumulating forever. A counter that
 * can only ever drift upward eventually refuses uploads on a bucket that is
 * mostly empty, and nobody would be able to tell why.
 */
export class StorageMeter extends Server<Env> {
  static options = { hibernate: false };

  #bytes: Record<string, number> | null = null;

  async #ready(): Promise<Record<string, number>> {
    if (!this.#bytes) {
      this.#bytes = (await this.ctx.storage.get<Record<string, number>>("bytes")) ?? {};
    }
    return this.#bytes;
  }

  #total(bytes: Record<string, number>): number {
    let sum = 0;
    for (const n of Object.values(bytes)) sum += n;
    return sum;
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const bytes = await this.#ready();
    const slug = (url.searchParams.get("slug") ?? "").toUpperCase();

    if (request.method === "POST") {
      let body: { slug?: string; bytes?: number; delta?: number };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: "body was not JSON" }, 400);
      }
      const target = String(body.slug ?? "").toUpperCase();
      if (!isSlug(target)) return json({ error: "bad board code" }, 400);

      if (typeof body.bytes === "number") {
        // An authoritative recount from the board itself.
        if (body.bytes <= 0) delete bytes[target];
        else bytes[target] = Math.round(body.bytes);
      } else if (typeof body.delta === "number") {
        // A cheap increment straight after an upload, so the next request sees
        // the new file without waiting for a recount.
        bytes[target] = Math.max(0, (bytes[target] ?? 0) + Math.round(body.delta));
      }
      await this.ctx.storage.put("bytes", bytes);
      return json({ board: bytes[target] ?? 0, total: this.#total(bytes) });
    }

    return json({
      board: bytes[slug] ?? 0,
      total: this.#total(bytes),
      budget: STORAGE_BUDGET_BYTES,
      boardLimit: MAX_BOARD_BYTES,
    } satisfies StorageUsage);
  }
}

/** The single meter instance. */
function meterStub(env: Env) {
  return env.StorageMeter.get(env.StorageMeter.idFromName("global"));
}

async function readUsage(env: Env, origin: string, slug: string): Promise<StorageUsage> {
  try {
    const res = await meterStub(env).fetch(`${origin}/?slug=${encodeURIComponent(slug)}`);
    return (await res.json()) as StorageUsage;
  } catch (err) {
    // A meter that is unreachable must not take uploads down with it. Reporting
    // zero use lets the per-file and per-request limits carry the load alone,
    // which is the pre-quota behaviour rather than a new failure mode.
    console.error("[quota] could not read usage", err);
    return { board: 0, total: 0, budget: STORAGE_BUDGET_BYTES, boardLimit: MAX_BOARD_BYTES };
  }
}

const EDITOR_COLORS = ["#7fd8f0", "#f0c469", "#8fd98a", "#b18cf0", "#f0803c", "#ff8fb0"];

/**
 * Every *stored file* the document points at, the final clue included.
 *
 * Only uploaded media counts. A YouTube clue keeps its video id in the same
 * `mediaKey` field, and that id is not an object in our bucket — letting it
 * into this set would put a foreign string into the reference list that the
 * orphan sweep diffs against, which is a good way to grow a bug that deletes
 * the wrong thing later.
 */
function mediaKeysIn(game: Game | null): Set<string> {
  const keys = new Set<string>();
  if (!game) return keys;
  for (const round of game.rounds) {
    for (const cat of round.categories) {
      for (const clue of cat.clues) {
        if (clue.mediaKey && isUploaded(clue.media)) keys.add(clue.mediaKey);
      }
    }
  }
  if (game.final?.mediaKey && isUploaded(game.final.media)) keys.add(game.final.mediaKey);
  return keys;
}

/** An upload is only considered abandoned once it is this old. */
const ORPHAN_GRACE_MS = 60 * 60 * 1000;
/** Don't re-list the bucket on every connect during a busy editing session. */
const SWEEP_THROTTLE_MS = 5 * 60 * 1000;

// The app is served from a different origin than this Worker, so the board
// routes need CORS. The WebSocket upgrade does not.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,HEAD,POST,PUT,OPTIONS",
  // `x-edit-key` is not a CORS-safelisted header, so an upload carrying it
  // triggers a preflight. Leaving it out of this list fails that preflight and
  // the browser reports a bare "failed to fetch" with no status to debug.
  "access-control-allow-headers": "content-type,x-edit-key",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...extra },
  });
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "weba",
  "audio/flac": "flac",
};

/**
 * Stream an upload straight into R2.
 *
 * The body is piped rather than buffered, so a 40 MB clip never lands in the
 * isolate's 128 MB heap, and the wait is network I/O which does not count
 * against the Worker's CPU budget.
 */
async function uploadMedia(request: Request, env: Env, slug: string, clueId: string): Promise<Response> {
  if (!isSlug(slug) || !/^[A-Za-z0-9_-]{1,40}$/.test(clueId)) {
    return json({ error: "bad upload target" }, 400);
  }

  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const isImage = type.startsWith("image/");
  const isVideo = type.startsWith("video/");
  const isAudio = type.startsWith("audio/");
  if (!isImage && !isVideo && !isAudio) {
    return json({ error: "only images, video and audio can be uploaded" }, 415);
  }

  const tooBig = `that file is too big — the limit is ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)} MB`;

  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > MAX_MEDIA_BYTES) return json({ error: tooBig }, 413);
  if (!request.body) return json({ error: "no file in the request" }, 400);

  // A fresh random segment per upload, so replacing a clue's media can never be
  // served from a stale cache under the old URL.
  const ext = EXT[type] ?? (isVideo ? "bin" : isAudio ? "snd" : "img");
  const key = `boards/${slug}/${clueId}/${crypto.randomUUID().slice(0, 12)}.${ext}`;

  // R2 will only take a stream whose length it knows. A request body that
  // declared content-length already qualifies, so it streams straight through
  // and never lands in the isolate's heap.
  let body: ReadableStream<Uint8Array> | Uint8Array;

  if (declared > 0) {
    body = request.body;
  } else {
    // Chunked upload: no declared length, so read it with a hard ceiling rather
    // than trusting an unbounded stream. Never holds more than the limit.
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let seen = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      if (seen > MAX_MEDIA_BYTES) {
        await reader.cancel().catch(() => {});
        return json({ error: tooBig }, 413);
      }
      chunks.push(value);
    }
    body = new Uint8Array(seen);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }

  try {
    await env.MEDIA.put(key, body, { httpMetadata: { contentType: type } });
  } catch (err) {
    // Best-effort tidy-up; a partial object would just waste space.
    await env.MEDIA.delete(key).catch(() => {});
    console.error("[media] put failed", err);
    return json({ error: "upload failed" }, 500);
  }

  // The stored size is echoed in a header rather than the body so the caller
  // can bill it to the quota without having to re-read the object.
  const stored = declared > 0 ? declared : ((await env.MEDIA.head(key))?.size ?? 0);
  return json(
    { key, media: isVideo ? "video" : isAudio ? "audio" : "image", contentType: type },
    200,
    { "x-stored-bytes": String(stored) },
  );
}

/** Serve a stored file, honouring Range so video scrubbing works. */
async function serveMedia(request: Request, env: Env, key: string): Promise<Response> {
  const range = request.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

  if (match) {
    const head = await env.MEDIA.head(key);
    if (!head) return json({ error: "not found" }, 404);
    const size = head.size;
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

    if (Number.isNaN(start) || start >= size || end < start) {
      return new Response("range not satisfiable", {
        status: 416,
        headers: { "content-range": `bytes */${size}`, ...CORS },
      });
    }

    const part = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!part) return json({ error: "not found" }, 404);

    return new Response(part.body, {
      status: 206,
      headers: {
        "content-type": head.httpMetadata?.contentType ?? "application/octet-stream",
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": String(end - start + 1),
        "accept-ranges": "bytes",
        "cache-control": "public, max-age=31536000, immutable",
        ...CORS,
      },
    });
  }

  const object = await env.MEDIA.get(key);
  if (!object) return json({ error: "not found" }, 404);

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "content-length": String(object.size),
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=31536000, immutable",
      ...CORS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const upload = url.pathname.match(/^\/upload\/([^/]+)\/([^/]+)$/);
    if (upload && request.method === "POST") {
      const slug = decodeURIComponent(upload[1]).toUpperCase();
      if (!isSlug(slug)) return json({ error: "bad board code" }, 400);

      // Ask the board whether this key may write, then stream the file
      // straight into R2 from here. The permission question travels to the
      // object; the file does not.
      const stub = env.BoardStore.get(env.BoardStore.idFromName(slug));
      const allowed = await stub.fetch(
        new Request(`${url.origin}/authorize`, {
          method: "POST",
          headers: { "x-edit-key": request.headers.get("x-edit-key") ?? "" },
        }),
      );
      if (!allowed.ok) return allowed;

      // Checked before a byte is stored, against the declared length. A chunked
      // upload declares nothing, and is caught by the running ceiling inside
      // `uploadMedia` instead.
      const usage = await readUsage(env, url.origin, slug);
      const declared = Number(request.headers.get("content-length") || "0");
      if (usage.total + declared > usage.budget) {
        return json(
          {
            error: `storage is full — ${formatBytes(usage.total)} of ${formatBytes(usage.budget)} used. delete some media, or use a YouTube link instead`,
          },
          507,
        );
      }
      if (usage.board + declared > usage.boardLimit) {
        return json(
          {
            error: `this board is using ${formatBytes(usage.board)} of its ${formatBytes(usage.boardLimit)} — delete something, or use a YouTube link`,
          },
          507,
        );
      }

      const stored = await uploadMedia(request, env, slug, decodeURIComponent(upload[2]));

      // Count it straight away so a burst of uploads cannot all pass the same
      // stale total. The board's own recount corrects this shortly after.
      if (stored.ok) {
        const size = Number(stored.headers.get("x-stored-bytes") || "0");
        if (size > 0) {
          ctx.waitUntil(
            meterStub(env)
              .fetch(`${url.origin}/`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ slug, delta: size }),
              })
              .then(() => undefined)
              .catch(() => undefined),
          );
        }
      }
      return stored;
    }

    if (url.pathname === "/usage" && request.method === "GET") {
      const slug = (url.searchParams.get("slug") ?? "").toUpperCase();
      if (!isSlug(slug)) return json({ error: "bad board code" }, 400);
      return json(await readUsage(env, url.origin, slug));
    }

    if (url.pathname.startsWith("/media/") && (request.method === "GET" || request.method === "HEAD")) {
      const key = decodeURIComponent(url.pathname.slice("/media/".length));
      if (!key || key.includes("..")) return json({ error: "bad key" }, 400);
      return serveMedia(request, env, key);
    }

    const board = url.pathname.match(/^\/boards\/([^/]+)$/);
    if (board) {
      const slug = decodeURIComponent(board[1]).toUpperCase();
      if (!isSlug(slug)) return json({ error: "bad board code" }, 400);
      const stub = env.BoardStore.get(env.BoardStore.idFromName(slug));
      return stub.fetch(new Request(url.origin + "/", request));
    }

    // The fallback carries CORS too. Without it the browser blocks the response
    // and the caller sees an opaque network error instead of a plain 404 —
    // which is exactly what a stale deploy missing a route looks like.
    return (
      (await routePartykitRequest(request, env)) ??
      json({ error: `no route for ${request.method} ${url.pathname}` }, 404)
    );
  },
};

