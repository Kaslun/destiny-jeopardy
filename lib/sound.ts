"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { read, write } from "./storage";
import { SOUND_FILES, SOUND_GAIN } from "./sounds.config";

/**
 * Room audio.
 *
 * Every cue has a synthesised WebAudio fallback, so the game makes noise with no
 * assets at all. Real recordings are opt-in per cue via `lib/sounds.config.ts`:
 * anything listed there is fetched and decoded on the first interaction and
 * played from memory, and anything absent keeps its synth.
 *
 * Nothing can be heard until the user interacts with the page — browsers refuse
 * to start audio otherwise. A TV is never touched, so surfaces should show the
 * `SoundGate` prompt while `audioReady()` is false rather than appearing mute.
 */

export type Cue =
  | "clueOpen"
  /** The read delay is up and the room may ring in. */
  | "buzzersOpen"
  | "buzz"
  | "correct"
  | "wrong"
  | "timeUp"
  | "dailyDouble"
  | "finalThink"
  /** Ambient bed under the board between clues. */
  | "boardBed"
  | "reveal"
  | "join"
  | "drumroll"
  | "placeReveal"
  | "fanfare";

/** Optional real audio, keyed by cue. Anything set here wins over the synth. */
const files = new Map<Cue, string>();
/** Decoded and ready to fire with no network or decode cost at play time. */
const buffers = new Map<Cue, AudioBuffer>();
const loading = new Set<Cue>();

export function setSoundFile(cue: Cue, url: string | null): void {
  if (url) {
    files.set(cue, url);
    void preloadCue(cue);
  } else {
    files.delete(cue);
    buffers.delete(cue);
  }
}

/**
 * Fetch and decode one cue up front.
 *
 * Playing via `new Audio(url)` costs a network fetch and a decode on the first
 * press, which on a buzzer is exactly the wrong place to spend tens of
 * milliseconds. Decoding once into an AudioBuffer makes every later play
 * effectively instant.
 */
async function preloadCue(cue: Cue): Promise<void> {
  const url = files.get(cue);
  const a = audio();
  if (!url || !a || buffers.has(cue) || loading.has(cue)) return;
  loading.add(cue);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[sound] ${cue}: ${url} returned ${res.status} — using the synthesised cue`);
      return;
    }
    buffers.set(cue, await a.decodeAudioData(await res.arrayBuffer()));
  } catch (err) {
    console.warn(`[sound] ${cue}: could not load ${url} — using the synthesised cue`, err);
  } finally {
    loading.delete(cue);
  }
}

/**
 * Cues that play as a bed rather than a hit.
 *
 * These replace themselves instead of layering, and can be faded out — the
 * final-round think music has to stop when the round does, not run on over the
 * reveal.
 */
const SUSTAINED = new Set<Cue>(["finalThink", "boardBed"]);

/** Whatever is currently sounding for a sustained cue, so it can be faded. */
const playing = new Map<Cue, { src: AudioBufferSourceNode; gain: GainNode }>();

/** Fade a sustained cue out and stop it. Silent no-op if it isn't playing. */
export function stopCue(cue: Cue, fadeSeconds = 1.2): void {
  const node = playing.get(cue);
  if (!node) return;
  playing.delete(cue);
  try {
    const a = audio();
    if (!a) return;
    const now = a.currentTime;
    const g = node.gain.gain;
    g.cancelScheduledValues(now);
    // exponentialRamp cannot reach or start from zero.
    g.setValueAtTime(Math.max(g.value, 0.0001), now);
    g.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
    node.src.stop(now + fadeSeconds + 0.05);
  } catch {
    /* already finished */
  }
}

/** Warm every configured cue. Safe to call more than once. */
export function preloadSounds(): void {
  for (const cue of files.keys()) void preloadCue(cue);
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/**
 * Browsers refuse to start audio until the user has interacted with the page.
 * Call this from any click or key press; it is cheap and idempotent.
 */
export function unlockAudio(): void {
  const a = audio();
  if (a && a.state === "suspended") void a.resume();
  // The first interaction is also the first moment we can decode, since an
  // AudioContext cannot exist before it.
  preloadSounds();
}

/**
 * Whether audio can actually be heard right now.
 *
 * A TV is the one screen nobody ever touches, so its AudioContext stays
 * suspended indefinitely and every cue is silently dropped. Surfaces use this
 * to show a prompt rather than appearing broken.
 */
export function audioReady(): boolean {
  return !!ctx && ctx.state === "running";
}

// Anything listed in the config is registered on load; decoding waits for the
// first interaction, when an AudioContext becomes possible.
for (const [cue, url] of Object.entries(SOUND_FILES)) {
  if (url) files.set(cue as Cue, url);
}

/** A single shaped tone. The building block for everything below. */
interface ToneSpec {
  freq: number;
  /** Slide from this frequency down (or up) to `freq`. Defaults to no slide. */
  from?: number;
  start?: number;
  length?: number;
  gain?: number;
  type?: OscillatorType;
}

function tone(a: AudioContext, spec: ToneSpec): void {
  const { freq, from = spec.freq, start = 0, length = 0.2, gain = 0.2, type = "sine" } = spec;
  const osc = a.createOscillator();
  const vol = a.createGain();
  const t0 = a.currentTime + start;

  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (from !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(freq, 1), t0 + length);

  // A short attack and an exponential tail: square edges click audibly.
  vol.gain.setValueAtTime(0.0001, t0);
  vol.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + length);

  osc.connect(vol).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.02);
}

function noise(a: AudioContext, { length = 0.25, gain = 0.12 }): void {
  const frames = Math.floor(a.sampleRate * length);
  const buffer = a.createBuffer(1, frames, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);

  const src = a.createBufferSource();
  const vol = a.createGain();
  src.buffer = buffer;
  vol.gain.setValueAtTime(gain, a.currentTime);
  src.connect(vol).connect(a.destination);
  src.start();
}

const SYNTH: Record<Cue, (a: AudioContext) => void> = {
  // Soft two-note rise as a clue comes up.
  clueOpen: (a) => {
    tone(a, { freq: 523.25, length: 0.14, gain: 0.14, type: "triangle" });
    tone(a, { freq: 783.99, start: 0.1, length: 0.22, gain: 0.14, type: "triangle" });
  },
  // The buzzer: short, blunt, unmistakable across a room.
  buzz: (a) => {
    tone(a, { freq: 180, from: 240, length: 0.18, gain: 0.28, type: "square" });
  },
  correct: (a) => {
    tone(a, { freq: 659.25, length: 0.12, gain: 0.16, type: "triangle" });
    tone(a, { freq: 987.77, start: 0.09, length: 0.26, gain: 0.16, type: "triangle" });
  },
  wrong: (a) => {
    tone(a, { freq: 150, from: 220, length: 0.32, gain: 0.22, type: "sawtooth" });
  },
  // Two rising blips: a starting pistol, not an announcement. It has to cut
  // through a room mid-sentence and be over before anyone looks up.
  buzzersOpen: (a) => {
    tone(a, { freq: 784, length: 0.09, gain: 0.16, type: "square" });
    tone(a, { freq: 1174.66, start: 0.09, length: 0.13, gain: 0.16, type: "square" });
  },
  // Falling tone plus a hiss — reads as "that's it" without being harsh.
  timeUp: (a) => {
    tone(a, { freq: 120, from: 420, length: 0.55, gain: 0.24, type: "sawtooth" });
    noise(a, { length: 0.4, gain: 0.07 });
  },
  dailyDouble: (a) => {
    [523.25, 698.46, 880, 1174.66].forEach((f, i) =>
      tone(a, { freq: f, start: i * 0.075, length: 0.2, gain: 0.15, type: "triangle" }),
    );
  },
  /**
   * The bed under an idle board.
   *
   * Deliberately close to nothing: two quiet, detuned low tones and a slow
   * pulse. A board that plays a *tune* between clues becomes maddening within
   * ten minutes and the host ends up muting the room — which costs every other
   * cue as well. This is meant to be noticed only when it stops.
   *
   * Best replaced with a real loop via `lib/sounds.config.ts`; the synth is a
   * placeholder that never needs one.
   */
  boardBed: (a) => {
    for (let i = 0; i < 8; i++) {
      tone(a, { freq: 55, start: i * 2, length: 2.1, gain: 0.035, type: "sine" });
      tone(a, { freq: 82.5, start: i * 2, length: 2.1, gain: 0.022, type: "sine" });
      tone(a, { freq: 110.3, start: i * 2 + 1, length: 1.1, gain: 0.014, type: "triangle" });
    }
  },
  // A few slow pulses when the final clue appears — a nod, not the real tune.
  finalThink: (a) => {
    [0, 0.36, 0.72].forEach((s) => tone(a, { freq: 392, start: s, length: 0.3, gain: 0.1, type: "sine" }));
  },
  reveal: (a) => {
    tone(a, { freq: 880, from: 587.33, length: 0.3, gain: 0.15, type: "triangle" });
  },
  join: (a) => {
    tone(a, { freq: 880, length: 0.1, gain: 0.1, type: "sine" });
  },
  // Accelerating low hits under the standings — tension, then release.
  drumroll: (a) => {
    for (let i = 0; i < 22; i++) {
      const t = i / 22;
      tone(a, {
        freq: 92 + Math.random() * 22,
        start: t * t * 1.5,
        length: 0.05,
        gain: 0.05 + t * 0.1,
        type: "triangle",
      });
    }
  },
  // Each place landing: a firm hit, not a jingle.
  placeReveal: (a) => {
    tone(a, { freq: 196, from: 330, length: 0.24, gain: 0.2, type: "triangle" });
    noise(a, { length: 0.16, gain: 0.05 });
  },
  // The winner. The only cue allowed to be triumphant.
  fanfare: (a) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone(a, { freq: f, start: i * 0.11, length: 0.34, gain: 0.16, type: "triangle" }));
    tone(a, { freq: 1046.5, start: 0.44, length: 0.9, gain: 0.19, type: "triangle" });
    tone(a, { freq: 1567.98, start: 0.44, length: 0.9, gain: 0.09, type: "sine" });
  },
};

export function playCue(cue: Cue): void {
  try {
    const a = audio();
    if (!a) return;
    if (a.state === "suspended") void a.resume();

    const buffer = buffers.get(cue);
    if (buffer) {
      // A bed replaces itself; hits are allowed to overlap, which is what makes
      // rapid buzzes sound right.
      if (SUSTAINED.has(cue)) stopCue(cue, 0.12);

      const src = a.createBufferSource();
      const vol = a.createGain();
      src.buffer = buffer;
      vol.gain.value = SOUND_GAIN[cue] ?? 0.85;
      src.connect(vol).connect(a.destination);
      src.start();

      if (SUSTAINED.has(cue)) {
        playing.set(cue, { src, gain: vol });
        src.onended = () => {
          if (playing.get(cue)?.src === src) playing.delete(cue);
        };
      }
      return;
    }

    // A file is configured but still decoding: fall through to the synth so the
    // first press of a session is never silent.
    SYNTH[cue]?.(a);
  } catch {
    // Sound is decoration; never let it break a game.
  }
}

export interface SoundControls {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  play: (cue: Cue) => void;
  /** Fade out a sustained cue such as the final-round music. */
  stop: (cue: Cue, fadeSeconds?: number) => void;
  /** False until a user gesture has let the browser start audio. */
  ready: boolean;
  /** Unlock from a real click — safe to call repeatedly. */
  enable: () => void;
  /** Fires a cue only when `when` flips from false to true. */
  useCueOn: (when: boolean, cue: Cue) => void;
}

export function useSound(enabledByDefault = true): SoundControls {
  const [muted, setMutedState] = useState(!enabledByDefault);
  const [ready, setReady] = useState(false);

  // Poll until audio is genuinely running. Cheap, stops as soon as it is, and
  // catches the case where the context resumes without us being told.
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => {
      if (audioReady()) setReady(true);
    }, 400);
    return () => clearInterval(id);
  }, [ready]);

  useEffect(() => {
    const saved = read("muted");
    if (saved !== null) setMutedState(saved === "1");
  }, []);

  // Any interaction is enough to satisfy the browser's autoplay rules.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    write("muted", next ? "1" : "0");
    if (!next) unlockAudio();
  }, []);

  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const play = useCallback((cue: Cue) => {
    if (!mutedRef.current) playCue(cue);
  }, []);

  const useCueOn = (when: boolean, cue: Cue) => {
    const previous = useRef(when);
    useEffect(() => {
      if (when && !previous.current) play(cue);
      previous.current = when;
    }, [when, cue]);
  };

  const enable = useCallback(() => {
    unlockAudio();
    if (audioReady()) setReady(true);
  }, []);

  const stop = useCallback((cue: Cue, fadeSeconds?: number) => stopCue(cue, fadeSeconds), []);

  return { muted, setMuted, ready, enable, play, stop, useCueOn };
}
