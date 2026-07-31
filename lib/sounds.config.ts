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
   finalThink: "/sounds/finalThink.mp3",
   reveal: "/sounds/reveal.wav",
   join: "/sounds/join.wav",
   // buzzersOpen: "/sounds/buzzersOpen.wav",
   // A looping ambient bed under the board between clues. Point this at a file
   // that loops cleanly and sits well below the other cues — it plays under the
   // host talking, so anything with a melody will fight them.
   // boardBed: "/sounds/boardBed.mp3",
};

/**
 * Per-cue volume, 0–1. Useful when one file is mastered louder than the rest —
 * commonly the buzzer, which tends to be recorded hot.
 */
export const SOUND_GAIN: Partial<Record<Cue, number>> = {
   buzz: 0.9,
   finalThink: 0.5,
   // Ambience, not a cue. It should be barely there.
   boardBed: 0.25,
};
