# Guardian Jeopardy

A buzzer trivia game for a room full of people and their phones.

Three live surfaces plus a board editor:

| Route          | Who looks at it | What it does                                        |
| -------------- | --------------- | --------------------------------------------------- |
| `/tv/[room]`   | The TV          | Board, scores, live clue, buzz order, final round     |
| `/host/[room]` | The host        | Loads the game, opens clues, rules on buzzes, scores  |
| `/play/[room]` | Each player     | Name entry, then one big buzzer                       |
| `/edit`        | The author      | Build a board, save it for a code                     |
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

Build a board at **`/edit`** and hit save. You get a short **board code**; type
that into the host console and the game loads. Boards live on the server (one
Durable Object per code), so a code is all anyone needs to run your game.

The editor autosaves a working draft to `localStorage`, so unsaved work survives
a refresh. It also keeps a local list of the codes you created — there is no
cross-object listing on the server, so losing that list loses the index, not the
boards. Import/export as JSON is still there for moving games between browsers.

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

## Not built yet

- Daily Double and final-round media (image/video) are carried in the data and
  badged, but the TV renders a placeholder rather than real media.
- No board browsing or search — codes are the only way in, by design.
- No auth: anyone with a board code can overwrite that board.
