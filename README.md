# Jeopardy

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
lib/            useRoom hook (partysocket) + themes and design tokens
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

The original design doc lives in `design/` and is published to `/design/` by
`npm run build`. It is the visual reference; the React editor at `/edit` is the
one wired to the game.

## Themes

A theme is a palette, a pair of typefaces, and the words the game uses about
itself. They live in `lib/themes.ts`; three ship today:

| Theme | Looks like |
| --- | --- |
| **Classic** | Royal blue and gold, the way the show does it. The default. |
| **Guardian** | The original design: deep navy, gold, sci-fi fireteam flavour. |
| **Midnight** | Slate and teal. Understated, no flavour of its own. |

The theme belongs to the **board**, picked in the editor, so the TV, host console
and every phone in the room agree without anyone configuring anything.

Colours and typefaces are **CSS custom properties**. `lib/theme.ts` exports `C`,
whose members are strings like `"var(--c-accent)"` rather than colours, so every
inline style in the app reads normally but resolves at paint time against
whichever theme is mounted. Switching a theme rewrites one `<style>` block —
nothing re-renders, and no component has to know themes exist.

Tokens are named for their **role**, never their colour: `accent`, `warn`,
`special`, `good`. A token called `gold` would be a lie in every theme but one,
and the lie spreads — the next person reads `C.gold` and reaches for gold.

`useTheme(id)` mounts a theme and hands back its `copy` and `classes`. It applies
the palette as a side effect on `document.head` rather than as rendered markup,
because the TV returns from half a dozen branches depending on what the room is
doing and a rendered `<ThemeStyle>` is easy to forget in the branch nobody tested.

Boards saved **before themes existed** have no `theme` field and render as
Guardian, so nothing anyone already built changes appearance. Only new boards
take the neutral default.

### Adding one

Add a `Theme` to `lib/themes.ts` and list it in `THEMES`. Every token is
required — there is no partial theme and no inheritance, because a theme that
falls back to another theme's colours for the tokens it forgot looks broken in
exactly the places nobody checked. If the theme brings a new typeface, add it to
the font link in `app/layout.tsx`.

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

## Access

There are no accounts. Nobody signs in to play a party game, and a login screen
between someone and a board they made would be worse than the problem it solves.
Instead each room and each board has a **secret you either hold or you don't**.

- **Rooms are claimed.** The first host to open one owns it; anyone else opening
  `/host/CODE` gets a read-only console that says so. The claim expires with the
  room, so an old code still hands you a room you can actually host.
- **Boards are readable by anyone with the code** — that is the sharing
  mechanism — but **writable only with the edit key**. Overwriting is what needs
  protecting: a guessed code should not be able to flatten a night's work.
  Uploading media counts as writing.
- Boards that predate this are **claimed by the next person who writes to them**
  holding a key. Weaker than issuing keys at creation, and the deliberate price
  of not breaking every board that already exists.

The key rides in the **URL fragment**, so it is a link you can send to a co-host
or open on another device, and it never reaches a server log the way a query
string would. It is mirrored into `localStorage`, so the ordinary case — same
person, same browser, later that evening — needs no link at all. The host console
and the editor both offer a copy button, and the editor's read-only *share* link
is labelled separately from its *edit* link.

This stops accidents and passers-by, which is the actual threat. It is not a
defence against someone determined who already has your link, and does not try
to be.

## Clue media

Clues can carry an image, a video, an audio file or a **YouTube link**. Upload
one in the editor and it appears on the TV when that clue opens, with a thumbnail
on the host console so the host knows what the room is looking at.

**Media is sized to its own shape.** The frame takes the picture's natural aspect
ratio once it is known, bounded by the height it was given rather than fixed to
it — a portrait photo or a vertical clip no longer sits in a slab of dead space
with the subject squeezed into a strip.

**A YouTube clue costs no storage**, since it stores a video id rather than a
file. It is the answer to a board built out of clips, and to the quota below.
Audio clues get a plate with the caption and controls, because a black rectangle
is not something a room can look at.

### The storage budget

R2's free tier is 10 GB and nothing used to count, so uploads simply accumulated.
A single `StorageMeter` object now holds the budget, because a ceiling shared
between boards can only be enforced by something that can see all of them.

- **9 GB overall**, set below the tier: a ceiling you can cross by a few hundred
  megabytes is not a ceiling.
- **1 GB per board**, so one board cannot eat the lot.
- The editor shows what the board is using, and turns amber near the limit.

The counter is a **cache, not the truth** — R2 is. Each board recomputes its own
size from a bucket listing whenever it changes and reports the real figure, so a
missed increment or a half-dead upload is corrected on the next edit. A counter
that can only drift upward eventually refuses uploads on a bucket that is mostly
empty, and nobody would be able to tell why.

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

### Cleaning up files

The board diffs its own media references after every change and deletes whatever
it stopped pointing at. That covers all seven ways a reference can disappear —
removed, replaced, the clue cleared, switched back to a placeholder, its category
deleted, the board replaced by a JSON import, or blanked — without each of those
having to remember to clean up after itself.

Two rules keep it safe:

- **Only files under the board's own `boards/<code>/` prefix are ever deleted**,
  so a board that imported another board's JSON can never delete files it does
  not own.
- A **sweep** on load and on connect (throttled) catches what no diff could see:
  uploads whose attaching edit never arrived. It only removes unreferenced files
  older than an hour, because a file uploaded seconds ago may just be waiting for
  its operation to land.

## The lobby

A room starts in a lobby rather than dropping straight onto a board. The TV
shows a **QR code** and the room code at a size meant to be scanned from a sofa;
players appear as they join, with a blip each time.

The join URL is built from the browser's own origin, so the code is correct on
localhost, on a LAN address and in production with nothing to configure.

The host console shows the same code compactly, an overview of who has joined,
and **Start the game**. Starting requires a board to be loaded — otherwise the
host is told why. Until then the board and the final round are closed
server-side, not merely hidden.

**Back to lobby** returns mid-game without losing anything: scores and the loaded
board survive, only the live clue is cleared. Useful between rounds, or when
someone arrives late.

## The results screen

**★ Final standings** ends the game on a reveal rather than a scoreboard. Places
come out **worst first**, one at a time, host-paced — the board fills from the
bottom and the top slot stays conspicuously empty, so everyone can see how much
is still unclaimed. That gap is where the tension lives; a table that simply
appeared would carry none of it.

Unrevealed places show as `• • • • •` with no rank and no score. The winner gets
a separate treatment: a larger card, light spilling out from behind it, and the
only triumphant sound in the game.

Every phone follows along — players see their own placing land, and the winner's
screen says so — so nobody is staring at a dead buzzer during the reveal.

It works with or without a final round, ties share a rank, and the board is
closed server-side while the standings are up.

## Rounds

A game is a **list of boards**, played in order, each with its own categories and
its own value ladder. Doubling the money for round two is the point of round two,
so the ladder belongs to the round rather than the game.

Adding a round in the editor gives you the previous round's width with its values
doubled, which is what a second round almost always is. Rounds advance by
themselves when a board is exhausted — round one to round two, and off the last
round into the final — and the host can step between them manually.

Played clues are keyed by **round as well as position**, so playing the 200 in
round one does not cross off the 200 in round two, and stepping back to an
earlier round still shows what was already taken.

Boards saved before rounds existed have `categories` and `values` at the top
level. `parseGame` folds those into a single round on the way in, so **every
board ever saved still loads** and nothing needed migrating in place.

## Clue timers and the read delay

A clue now runs in two stretches: it is **read**, and then it is **answered**.

| Setting | Behaviour |
| --- | --- |
| Read delay, seconds | The clue is on screen but the buzzers are shut |
| Timed, no seconds given | Uses the board default |
| Timed, seconds given | Uses that, clamped to 5–300 |
| **Timer off** | No clock at all; buzzers stay open until the host closes it |

Both resolve clue → board → fallback; the timer falls back to 20 seconds and the
read delay to none, so a board that says nothing behaves exactly as it always
has. A video clue wants a read delay about as long as the clip.

**The buzzers are shut server-side for the whole read delay** — refused on
arrival, not merely greyed out on the phone, because a disabled button is a
suggestion and this is a rule. Every screen counts down to the moment they open,
the TV plays a cue when they do, and the phone's buzzer becomes a countdown
rather than a padlock. The host can open them early with **Open buzzers now**,
which only ever moves the moment forward — sending it twice cannot gift the room
extra time.

`RoomState.openedAt` is **when the buzzers open**, which may be in the future.
One number drives the countdown to the opening, the clue's own clock, and the
server's judgement of an early or late buzz, so those three can never disagree.

Screens count down locally from when the clue appeared rather than from the
server's epoch, so a viewer whose system clock is wrong still sees a full,
correct bar. That display clock never decides the rules.

## Settling a clue

A correct ruling used to close the clue instantly, which snapped the room back to
the board before anyone had heard what the answer was — the one moment everybody
is waiting for. Now a ruling that settles a clue **reveals the answer and holds**;
moving on is a separate, deliberate press. The same happens when a wrong answer
leaves nobody able to take it.

Board control — whoever answered last, and therefore picks next — is shown on the
TV, on the host console and on that player's phone. The host can reassign it when
a clue nobody got leaves it stale.

## Feel

Motion lives in `app/globals.css` as a small set of classes (`tap`, `lift`,
`tile`, `anim-*`) applied alongside the inline styles, so timing and easing are
defined once. Nothing runs longer than 400ms except deliberate ambience — a game
show should feel struck, not eased.

- **Phone**: the buzzer scales under the finger and throws a ring outward, the
  whole screen warms when you're first, and haptics differ between "your buzz
  landed" and "you were first" so you can tell them apart without looking.
- **TV**: clues rise into place, buzz entries land one after another, the clock
  pulses through its last five seconds, and the winner's name catches a single
  pass of light.
- **Host**: press and hover feedback only. It is an instrument, not a spectacle.
- **Scores count** to their new value everywhere, flashing green up or orange
  down.

`prefers-reduced-motion` disables all of it, including the count-up.

**Scores never lie to look good.** `requestAnimationFrame` is suspended outright
in a background tab, so the count-up is backed by a timer that forces the true
value regardless. The tween is a flourish; the number is the truth.

## Sound

Cues are **synthesised with WebAudio**, not shipped as files — the game makes
noise with no assets to host, nothing to license, and nothing extra to download
onto a phone.

Twelve cues, defined in `lib/sound.ts`:

| Cue | Fires when | Plays on |
| --- | --- | --- |
| `clueOpen` | a clue goes live | TV |
| `buzzersOpen` | the read delay ends and the room may ring in | TV |
| `boardBed` | ambience under the board between clues | TV |
| `buzz` | the first buzz lands / your own buzz registers | TV, phone |
| `correct` | the host rules correct / you turn out to be first in | TV, phone |
| `wrong` | the host rules wrong | TV |
| `timeUp` | the clock runs out with nobody in | TV |
| `dailyDouble` | a Daily Double opens and the wager begins | TV |
| `finalThink` | the final clue appears | TV |
| `reveal` | the host reveals the answer | TV |
| `join` | someone joins the lobby | TV |
| `drumroll` | the closing standings open | TV |
| `placeReveal` | each place is revealed | TV |
| `fanfare` | the winner is revealed | TV |

The arc through the standings is deliberate: an accelerating roll while the
board is still empty, a firm hit per place, and a fanfare kept for the winner
alone. It is the only triumphant sound in the game, which is what makes it land.

Verdict sounds come from `RoomState.lastRuling` rather than being inferred on
each screen. A wrong answer looks different in every mode — an ordinary clue
grows `spent`, a Daily Double simply closes exactly as a correct one does, and
the final round marks an entry — so the room states its verdict and every screen
reacts the same way. It carries a sequence number, so two wrong answers in a row
are two sounds rather than one.

Who makes noise:

- The **TV is the room's speaker** and plays everything above.
- **Phones only confirm your own actions** — your buzz, and being first. A room
  of phones echoing the TV would be chaos. They vibrate too where supported, with
  different patterns for "your buzz landed" and "you were first".
- The **host console stays silent**; it sits next to the TV.
- Mute is a toggle on the TV and persists per browser.

### Using real audio files

Drop files into `public/sounds/` and point their cues at them in
**`lib/sounds.config.ts`**. Anything left out keeps its synthesised version, so
you can replace the set one sound at a time and the game always makes noise.
`SOUND_GAIN` trims a file that is mastered louder than the rest.

Files are fetched and decoded once, on the first interaction, then played from
memory — a buzzer that waits on a network round trip is a broken buzzer. A
missing or unplayable file logs a warning and falls back to its synth rather than
going silent.

`public/sounds/README.md` covers what each cue should sound like, where to find
CC0 sources, and why the real *Think!* music should not go into anything you
deploy.

### Audio has to be switched on

Browsers refuse to start audio until someone interacts with the page — and **a TV
is the one screen nobody ever touches**, so it would otherwise sit there silently
dropping every cue.

Every TV view therefore shows a **Turn on sound** prompt until audio is genuinely
running, with a *Play silent* option next to it. One click at the start of the
night is all it needs. Phones and the host console unlock on their first tap
anyway.

## Not built yet

### Gameplay

- **The host drives the board.** Players cannot pick their own clue from their
  phone, which is how board control works on the show. Whose turn it is *is*
  shown everywhere, so the host is told what to click.
- **The read delay is a clock, not a detector.** It cannot tell that a video has
  actually finished — set it to roughly the clip's length, and use *Open buzzers
  now* if it runs short.

### Media

- **Video autoplay may be blocked** until someone interacts with the TV page.
  `controls` is the fallback, and the sound gate usually satisfies it in practice.
- **A YouTube embed obeys YouTube.** Ads, age gates and unavailable-in-your-country
  are outside our control; an uploaded file never surprises you mid-game.

### Boards

- **No way to delete a board.** `/boards/:code` has no DELETE, so a board and its
  media live forever once created. Its media *is* now counted against the budget.
- **No browsing or search** — codes are the only way in. Deliberate.
- **Losing the edit key loses write access**, with no recovery. Boards are cheap
  to remake and a recovery path would be a way in for everyone else.

### Rooms

- **A room mid-game across a deploy of the round changes** sees an empty board:
  played clues are keyed by round now, and the old keys no longer match. Rooms
  are ephemeral and expire in 12 hours, so this only bites a game in progress.

### Infrastructure

- **The worker and R2 bucket are still named `guardian-jeopardy-*`.** Renaming
  the worker publishes a second one and strands every Durable Object; a bucket
  cannot be renamed at all. Both are commented in `wrangler.jsonc`. Changing
  them is a planned migration, not a tidy-up.

### Collaboration

- **Two people in the same field is last-write-wins.** Deliberate: merging
  characters inside one clue needs a CRDT. Presence is the mitigation.

### Elsewhere

- **Nothing is recorded between games.** No past scores, no winners, no stats.
- **A running game does not follow live board edits.** The room takes a snapshot
  when the host loads a code, so editing that board mid-game does not disturb
  play. Intentional, but worth knowing.
