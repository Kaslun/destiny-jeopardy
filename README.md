# Guardian Jeopardy

A buzzer trivia game for a room full of people and their phones.

Three live surfaces plus a board editor:

| Route          | Who looks at it | What it does                                        |
| -------------- | --------------- | --------------------------------------------------- |
| `/tv/[room]`   | The TV          | Board, scores, live clue, buzz order, final round     |
| `/host/[room]` | The host        | Loads the game, opens clues, rules on buzzes, scores  |
| `/play/[room]` | Each player     | Name entry, then one big buzzer                       |
| `/edit`        | The author      | Build a board, save it for a code                     |
| `/edit/[code]` | Authors, plural | The same board, edited by several people at once      |
| `/design/`     | Reference       | The original design doc                               |

## Architecture

Two deployables, on purpose.

**The Next.js app on Vercel** serves the four surfaces. It holds no game state.

**The room server** is a Cloudflare Worker with one Durable Object per room code,
built on [PartyServer](https://github.com/cloudflare/partykit). It owns
everything the room must agree on: scores, which clues are spent, and above all
the buzz order.

The buzzer is what forces this split. Ranking buzzes requires one clock that
every player shares, so clients never send timings — they send `buzz`, and the
room stamps arrival. Anything that scales out to multiple stateless instances
gets this wrong, because two players can land on different instances with no
shared ordering. A Durable Object is a single addressable authority per room,
which is exactly the shape of the problem.

State is broadcast as a whole snapshot on every change. It is a few KB, and full
snapshots remove a category of desync bugs that incremental patches invite.

```
app/            Next.js App Router — the four surfaces
lib/            useRoom hook (partysocket) + design tokens
server/         the Worker: JeopardyRoom Durable Object
shared/         wire protocol, shared by both ends
design/         the original design doc + board editor
```

## Authoring a game

Build a board at **`/edit`** and hit **Save & share**. You get a short **board
code**; type that into the host console and the game loads. Boards live on the
server (one Durable Object per code), so a code is all anyone needs.

**`/edit/[code]` is collaborative.** Send someone the URL and you edit the same
board together, live. Everyone's name and colour show in the header, the cell
each person is looking at is ringed in their colour, and the inspector warns you
when someone else is in the clue you just opened. There is no save button — the
server owns the document and every change is persisted as it happens.

`/edit` with no code is a private local draft in `localStorage`. It only reaches
the server, and becomes collaborative, when you save it. The editor also keeps a
local list of codes you created; there is no cross-object listing on the server,
so losing that list loses the index, not the boards. Import/export as JSON still
works in both modes.

### How concurrent edits are resolved

Edits travel as small **operations** — "set the answer of clue X", "rename
category Y" — not whole documents, and every operation addresses categories and
clues by a **stable id** rather than a position. The board object applies them in
arrival order, which is a real total order because there is exactly one object
per board.

That means two people on different clues both land, and even the clue text and
its answer can be edited at the same time. Deleting or reordering a category
cannot misdirect someone else's keystrokes into the wrong cell, and an operation
aimed at a category that has just been deleted is dropped rather than throwing.

Two people typing in the **same field** is last-write-wins. That is a deliberate
limit: merging characters inside one clue needs a CRDT, which is a lot of machinery
for a six-by-five grid. Presence is the mitigation — you can see someone is in
there before you start.

The original design doc lives at `design/Guardian Jeopardy.dc.html` and is
published to `/design/` by `npm run build`. It is the visual reference; the
React editor at `/edit` is the one wired to the game.

## Local development

Two processes:

```bash
npm run server:dev
```

```bash
npm run dev
```

The client defaults to `127.0.0.1:8787` when `NEXT_PUBLIC_PARTY_HOST` is unset,
which is where `wrangler dev` listens. Open `/host/DEMO` on a laptop and
`/play/DEMO` on a phone on the same network.

## Deploying

Deploy the room server first, because the app needs its hostname.

```bash
npx wrangler deploy
```

Take the `*.workers.dev` hostname it prints, set it on Vercel as
`NEXT_PUBLIC_PARTY_HOST` (hostname only, no `https://`), then:

```bash
npx vercel --prod
```

## Notes

- **`wrangler` is pinned to `~4.105.0`.** From 4.110 it peers on
  `@cloudflare/workers-types@^5`, which `partyserver@0.5.8` does not accept yet.
  Unpin once partyserver moves to v5.
- **The Durable Object is SQLite-backed** (`new_sqlite_classes`). Cloudflare no
  longer allows new KV-backed namespaces.
- **Hibernation is off.** While a game is running we want the room resident,
  since it is the buzz authority. It costs idle time between rounds and buys a
  warm, consistent room all night.
- **Closing a clue consumes it**, answered or not. A clue that has been read
  aloud cannot go back on the board.
- **Daily Doubles are not a buzzer race.** Opening one puts the room in a
  `wager` phase belonging to a single player — by default whoever has board
  control, meaning the last person to answer correctly. The host can reassign
  before the wager. Nobody else can buzz, and the ruling resolves the clue
  either way: a miss ends it rather than falling through to a queue.
- **The TV hides the clue during a wager**, since the wagering player is looking
  at it. The host console still shows it — they need to read it aloud next.
- **Wagers are clamped server-side** to `[min(5, max), max]`, where the ceiling
  is the greater of the player's score and the top value on the board, so
  someone on zero or in the red can still bet. A phone can send anything; the
  room decides.
- **The Worker is type-checked separately** (`server/tsconfig.json`) so
  Cloudflare globals don't leak into browser code. `npm run typecheck` runs both.
- **The final round is only for players in the black.** Anyone on zero or below
  has nothing to wager and sits it out. Everyone eligible wagers blind knowing
  only the category; the clue stays hidden on the TV and on phones until every
  wager is in. Reveal order is lowest score first, so the leader lands last.
- **Board routes need CORS** (`/boards/:slug`), since the app is served from a
  different origin than the Worker. The WebSocket upgrade does not.
- **`BoardStore` serves both protocols.** WebSockets at
  `/parties/board-store/:code` for collaborative editing, and plain GET/PUT at
  `/boards/:code` for the host console, which only ever wants a whole board. A
  PUT also broadcasts, so an outside overwrite reaches anyone with it open.

## Clue media

Clues can carry a real image or video. Upload one in the editor and it appears
on the TV when that clue opens, with a thumbnail on the host console so the host
knows what the room is looking at.

Files live in **R2**, streamed through the Worker — `POST /upload/:code/:clueId`
to store, `GET /media/:key` to serve. R2 rather than a blob host because egress
is free, which matters when a room reloads the same clip.

- Up to **50 MB** per file. Workers cap a request body at 100 MB regardless.
- Keys are `boards/<code>/<clueId>/<random>.<ext>`. The random segment means
  replacing a clue's media can never serve a stale cached file, so responses are
  `immutable` with a one-year max-age.
- **Range requests are supported**, so video scrubbing works.
- Uploads need a saved board, since keys are scoped to its code. The editor says
  so rather than failing oddly if you try from an unsaved draft.
- The size ceiling is enforced twice: on `content-length`, and again while
  reading, because a chunked upload declares no length at all.

R2 must be enabled once from the Cloudflare dashboard, then:

```bash
npx wrangler r2 bucket create guardian-jeopardy-media
```

## Not built yet

- **Orphaned media is never collected.** Replacing or removing a clue's file
  leaves the old object in R2. Harmless at this scale, but there is no sweeper.
- Video autoplays with `controls` as a fallback; browsers may block autoplay
  with sound until someone interacts with the TV page.
- No board browsing or search — codes are the only way in, by design.
- No auth: anyone with a board code can overwrite it, edit it live, or upload
  media to it.
