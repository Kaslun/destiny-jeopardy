# Clue sounds

Drop audio files in this folder, then uncomment the matching line in
`lib/sounds.config.ts`. Cues you leave commented keep using the built-in
synthesised versions, so you can replace them one at a time.

`.mp3` is the safe choice — every browser plays it. `.ogg` and `.wav` also work;
just match the filename in the config.

Files are fetched and decoded once on the first interaction, then played from
memory, so a big file costs load time but never playback delay. Keep one-shots
short anyway: under ~100 KB each is plenty.

## What to look for

| Cue | Length | Character | Search terms |
| --- | --- | --- | --- |
| `buzz` | 0.1–0.3s | Blunt and loud. Must cut through a noisy room. | "quiz buzzer", "game show buzzer", "klaxon short" |
| `correct` | 0.3–0.6s | Bright rising chime or bell ding. | "correct answer", "success chime", "ding correct" |
| `wrong` | 0.3–0.6s | Low descending buzz or thud. Not comedic. | "wrong answer", "incorrect buzzer", "fail low" |
| `clueOpen` | 0.2–0.4s | Soft whoosh or swell as the clue appears. | "ui whoosh", "swoosh reveal", "card flip" |
| `timeUp` | 0.5–1s | Falling tone. Final, not punishing. | "time up", "buzzer end", "countdown end" |
| `dailyDouble` | 0.8–1.5s | Short fanfare. The moment should feel like an event. | "fanfare short", "sting reveal", "jackpot" |
| `finalThink` | up to 30s | Ticking tension bed for the final round. | "think music", "tension loop", "clock ticking" |
| `reveal` | 0.3–0.6s | Sparkle or riser as the answer shows. | "reveal", "riser short", "magic sparkle" |
| `join` | 0.1–0.2s | Quiet blip. It fires often — keep it unobtrusive. | "ui blip", "notification soft", "pop ui" |

## Where to get them

**No attribution required** — simplest if you ever share this:

- **[Kenney](https://kenney.nl/assets?q=audio)** — CC0 game asset packs. The
  *Interface Sounds* and *UI Audio* packs cover `join`, `clueOpen`, `correct`
  and `reveal` well. Consistent in tone, which matters more than any single
  sound being perfect.
- **[Mixkit](https://mixkit.co/free-sound-effects/game/)** — free for
  commercial use, no credit needed. Strong game-show and quiz section.
- **[Pixabay](https://pixabay.com/sound-effects/search/game%20show/)** — large,
  free for commercial use, no attribution.

**Attribution or filtering required:**

- **[Freesound](https://freesound.org/search/?q=quiz+buzzer)** — the deepest
  library by far, but licences are mixed. Filter to **CC0** unless you are
  willing to credit.
- **[OpenGameArt](https://opengameart.org/art-search?keys=buzzer)** — filter to
  CC0.
- **[Zapsplat](https://www.zapsplat.com/sound-effect-category/game-show/)** —
  free with credit, paid to drop it.

## On the real Jeopardy music

The familiar think-music cue is **"Think!" by Merv Griffin, and it is
copyrighted**. It is fine humming it at your kitchen table; putting it in a
deployed site is republishing someone's composition. For anything you share,
use a generic tension bed from the sources above.

The same applies to the show's buzzer and reveal stings ripped from broadcasts —
they are recordings from a commercial production. Generic game-show SFX get you
90% of the feel with none of the exposure.

## Keeping them consistent

A set from one pack will beat individually perfect sounds from nine different
ones. Mismatched sample rates and mastering levels are what make a game sound
amateurish, not the choice of buzzer.

If one file is louder than the rest, trim it in `SOUND_GAIN` in
`lib/sounds.config.ts` rather than re-exporting the audio.
