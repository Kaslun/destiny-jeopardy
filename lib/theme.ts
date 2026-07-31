/**
 * Design tokens, as CSS custom property references.
 *
 * `C.accent` is the string `"var(--c-accent)"`, not a colour. That is the whole
 * trick: every inline style and template literal in the app keeps reading like
 * ordinary styling, but the values resolve at paint time from whatever theme is
 * mounted. Switching theme rewrites one `<style>` block — no component re-runs,
 * nothing has to thread a theme object through props.
 *
 * The concrete values, and the words each theme uses, live in `lib/themes.ts`.
 */

import { TINT_COUNT, type ColorToken, type SceneToken } from "./themes";

function token(name: ColorToken): string {
  return `var(--c-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})`;
}

/** Colour roles. Named for what they do, never for what colour they are. */
export const C = {
  /* surfaces, back to front */
  bg: token("bg"),
  panel: token("panel"),
  panelDeep: token("panelDeep"),
  tile: token("tile"),
  /** Buttons, badges, anything raised off a panel. */
  surface: token("surface"),
  /** Inset wells: fields, progress tracks, spent tiles. */
  surfaceDeep: token("surfaceDeep"),

  /* borders, strongest to weakest */
  edge: token("edge"),
  edgeSoft: token("edgeSoft"),
  line: token("line"),
  lineSoft: token("lineSoft"),
  lineFaint: token("lineFaint"),

  /* text, brightest to dimmest */
  text: token("text"),
  dim: token("dim"),
  /** Small-caps labels — the most common non-body text in the app. */
  muted: token("muted"),
  mutedDeep: token("mutedDeep"),
  dimmer: token("dimmer"),
  faint: token("faint"),

  /** Values, primary buttons, room codes. */
  accent: token("accent"),
  accentDeep: token("accentDeep"),
  accentSoft: token("accentSoft"),
  /** Text and icons sitting *on* an accent fill. */
  onAccent: token("onAccent"),

  info: token("info"),
  warn: token("warn"),
  special: token("special"),
  good: token("good"),
} as const;

/** Full-bleed page backgrounds. */
export const SCENE: Record<SceneToken, string> = {
  landing: "var(--scene-landing)",
  board: "var(--scene-board)",
  clue: "var(--scene-clue)",
  dailyDouble: "var(--scene-daily-double)",
  final: "var(--scene-final)",
  results: "var(--scene-results)",
  winner: "var(--scene-winner)",
};

export const mono = "var(--font-mono)";
export const display = "var(--font-display)";

/** The seat colour for the nth player. */
export function tintFor(index: number): string {
  return `var(--tint-${((index % TINT_COUNT) + TINT_COUNT) % TINT_COUNT})`;
}

/**
 * A token at partial opacity.
 *
 * The palette is a set of variables, so `rgba(…)` is not available — the
 * channels aren't known here. `color-mix` composites against transparency at
 * paint time, which is the same result and stays theme-aware.
 */
export function alpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

export function money(n: number): string {
  return (n < 0 ? "−" : "") + Math.abs(n).toLocaleString();
}

/** Four-character room codes, no vowels — avoids accidental words. */
export function newRoomCode(): string {
  const alphabet = "BCDFGHJKLMNPQRSTVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
