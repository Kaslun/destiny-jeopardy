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
   buzz: "/sounds/buzz.wav",
   correct: "/sounds/correct.wav",
   wrong: "/sounds/wrong.wav",
   clueOpen: "/sounds/clueOpen.wav",
   timeUp: "/sounds/timeUp.wav",
   dailyDouble: "/sounds/dailyDouble.wav",
   finalThink: "/sounds/finalThink.wav",
   reveal: "/sounds/reveal.wav",
   join: "/sounds/join.wav",
};

/**
 * Per-cue volume, 0–1. Useful when one file is mastered louder than the rest —
 * commonly the buzzer, which tends to be recorded hot.
 */
export const SOUND_GAIN: Partial<Record<Cue, number>> = {
   buzz: 0.9,
   finalThink: 0.5,
};
