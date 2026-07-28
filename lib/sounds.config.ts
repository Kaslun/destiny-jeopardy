import type { Cue } from "./sound";

/**
 * Real audio files, replacing the built-in synthesised cues.
 *
 * Drop files into `public/sounds/` and uncomment the matching line. Anything
 * left commented keeps using the synth, so you can replace cues one at a time
 * rather than needing a full set before you hear anything.
 *
 * Files are fetched and decoded once, then played from memory — a buzzer that
 * waits on a network round trip is a broken buzzer.
 *
 * See `public/sounds/README.md` for what each cue should sound like and where
 * to find them.
 */
export const SOUND_FILES: Partial<Record<Cue, string>> = {
  // buzz: "/sounds/buzz.mp3",
  // correct: "/sounds/correct.mp3",
  // wrong: "/sounds/wrong.mp3",
  // clueOpen: "/sounds/clue-open.mp3",
  // timeUp: "/sounds/time-up.mp3",
  // dailyDouble: "/sounds/daily-double.mp3",
  // finalThink: "/sounds/final-think.mp3",
  // reveal: "/sounds/reveal.mp3",
  // join: "/sounds/join.mp3",
};

/**
 * Per-cue volume, 0–1. Useful when one file is mastered louder than the rest —
 * commonly the buzzer, which tends to be recorded hot.
 */
export const SOUND_GAIN: Partial<Record<Cue, number>> = {
  // buzz: 0.9,
  // finalThink: 0.5,
};
