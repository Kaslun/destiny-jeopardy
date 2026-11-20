/**
 * Themes.
 *
 * A theme is a palette, a set of typefaces, a corner style and the words the
 * game uses about itself. Everything visual ships as CSS
 * custom properties — every surface styles itself through `var(--c-…)` via the
 * `C` map in `lib/theme.ts` — so switching theme is a variable swap with no
 * re-render.
 *
 * ## Adding a preset
 *
 * Write a `ThemeSpec` and add it to `PRESETS`. Only `bg` and `accent` are
 * required; every other colour, the page backgrounds and the seat colours are
 * derived from those two, for dark and light backgrounds alike. Anything the
 * derivation gets wrong for your taste can be pinned in `colors` / `scenes`.
 *
 * ## Board styles
 *
 * Authors customise a preset from the editor's Style panel: accent, background,
 * board colour, typeface, corners, capitals and a logo mark. Those
 * overrides live on the board (`game.style`) and are folded in by
 * `resolveTheme`, so the TV, the host and every phone agree without anyone
 * configuring anything.
 *
 * Tokens are named for their *role*, never their colour: `accent` is gold in
 * one theme and teal in another.
 */

import { isDark, mix, readableOn } from "./color";
import type { BoardStyle } from "../shared/protocol";

export type ColorToken =
  /* surfaces, back to front */
  | "bg"
  | "panel"
  | "panelDeep"
  | "tile"
  | "surface"
  | "surfaceDeep"
  /* borders, strongest to weakest */
  | "edge"
  | "edgeSoft"
  | "line"
  | "lineSoft"
  | "lineFaint"
  /* text, brightest to dimmest */
  | "text"
  | "dim"
  | "muted"
  | "mutedDeep"
  | "dimmer"
  | "faint"
  /* the primary accent, and what reads legibly on top of it */
  | "accent"
  | "accentDeep"
  | "accentSoft"
  | "onAccent"
  /* semantics */
  | "info"
  | "warn"
  | "special"
  | "good"
  /* the game board: its screens, the text on them, and the bezel between */
  | "cell"
  | "cellInk"
  | "gap";

/** Full-bleed page backgrounds — where a theme's mood mostly lives. */
export type SceneToken = "landing" | "board" | "clue" | "dailyDouble" | "final" | "results" | "winner";

export const TINT_COUNT = 6;
export type Tints = readonly [string, string, string, string, string, string];

export type Corners = NonNullable<BoardStyle["corners"]>;

/** The words a theme puts in the game's mouth. */
export interface ThemeCopy {
  appName: string;
  tagline: string;
  /** What a player is called when they don't type a name. */
  defaultPlayerName: string;
  /** The phone's join button. */
  joinLabel: string;
  /** What the roster's second line is called — "class", "team". */
  classLabel: string;
  classFallback: string;
  codeExample: string;
}

/* ------------------------------------------------------------------ */
/* Typefaces                                                            */
/* ------------------------------------------------------------------ */

export interface FontDef {
  id: string;
  name: string;
  /** CSS `font-family` value. */
  stack: string;
  /** Google Fonts `family=` parameter. Loaded on demand by `useTheme`. */
  google: string;
  /** Weight to set headings in. Single-weight faces are already heavy. */
  weight?: number;
  /** Size multiplier for faces that run small, like handwriting. */
  scale?: number;
}

/** Display faces an author can pick. The UI itself is always set in Inter. */
export const FONTS: readonly FontDef[] = [
  { id: "anton", name: "Anton", stack: "'Anton', 'Arial Narrow', sans-serif", google: "Anton", weight: 400 },
  { id: "oswald", name: "Oswald", stack: "'Oswald', 'Arial Narrow', sans-serif", google: "Oswald:wght@500;600;700" },
  { id: "merriweather", name: "Merriweather", stack: "'Merriweather', Georgia, serif", google: "Merriweather:wght@400;700;900" },
  { id: "chakra", name: "Chakra Petch", stack: "'Chakra Petch', sans-serif", google: "Chakra+Petch:wght@500;600;700" },
  { id: "grotesk", name: "Space Grotesk", stack: "'Space Grotesk', sans-serif", google: "Space+Grotesk:wght@500;600;700" },
  {
    id: "bricolage",
    name: "Bricolage",
    stack: "'Bricolage Grotesque', sans-serif",
    google: "Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800",
  },
  { id: "fraunces", name: "Fraunces", stack: "'Fraunces', Georgia, serif", google: "Fraunces:opsz,wght@9..144,600;9..144,700" },
  { id: "fredoka", name: "Fredoka", stack: "'Fredoka', sans-serif", google: "Fredoka:wght@500;600;700" },
  { id: "outfit", name: "Outfit", stack: "'Outfit', sans-serif", google: "Outfit:wght@500;600;700;800" },
  { id: "silkscreen", name: "Silkscreen", stack: "'Silkscreen', monospace", google: "Silkscreen:wght@400;700" },
];

/** Faces a theme can use for names or long text, but that aren't offered as headings. */
const EXTRA_FONTS: readonly FontDef[] = [
  { id: "caveat", name: "Caveat", stack: "'Caveat', 'Comic Sans MS', cursive", google: "Caveat:wght@600;700", scale: 1.3 },
  { id: "inter", name: "Inter", stack: "'Inter', system-ui, sans-serif", google: "Inter:wght@400;500;600;700;800" },
];

export const BODY_FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const MONO_FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function fontById(id: string | undefined): FontDef {
  return FONTS.find((f) => f.id === id) ?? EXTRA_FONTS.find((f) => f.id === id) ?? FONTS[0];
}

/* ------------------------------------------------------------------ */
/* Specs and the built theme                                            */
/* ------------------------------------------------------------------ */

/** What a preset author writes. Only `bg` and `accent` are required. */
export interface ThemeSpec {
  id: string;
  name: string;
  bg: string;
  accent: string;
  /** Headings, values and categories. */
  font?: string;
  /** Clues and other long text. Defaults to `font`. */
  textFont?: string;
  /** Player names on the big screen. Defaults to the UI face. */
  nameFont?: string;
  corners?: Corners;
  /** `hard` sets big-screen text with a broadcast-style drop shadow. */
  shadow?: "glow" | "hard";
  /** Headings in capitals. */
  caps?: boolean;
  /** Clues in capitals, the way a quiz-show screen sets them. */
  clueCaps?: boolean;
  /** Shown in the logo slot. Empty means the default diamond. */
  mark?: string;
  /** Semantic colours; derived for the background when left out. */
  info?: string;
  warn?: string;
  special?: string;
  good?: string;
  tints?: Tints;
  /** Escape hatch: pin any derived token. */
  colors?: Partial<Record<ColorToken, string>>;
  scenes?: Partial<Record<SceneToken, string>>;
  copy?: Partial<ThemeCopy>;
  classes?: readonly string[];
}

export interface Theme {
  /** Stable for a given preset + overrides, so it can key effects. */
  id: string;
  /** The preset this was built from. */
  presetId: string;
  name: string;
  dark: boolean;
  colors: Record<ColorToken, string>;
  tints: Tints;
  fonts: { display: string; text: string; name: string; body: string; mono: string };
  fontId: string;
  /** Every face this theme needs loaded. */
  fontIds: string[];
  displayWeight: number;
  textWeight: number;
  nameScale: number;
  corners: Corners;
  shadow: "glow" | "hard";
  caps: boolean;
  clueCaps: boolean;
  mark: string;
  scenes: Record<SceneToken, string>;
  copy: ThemeCopy;
  classes: readonly string[];
}

const DEFAULT_COPY: ThemeCopy = {
  appName: "Jeoparty",
  tagline: "The buzzer quiz for a room full of phones",
  defaultPlayerName: "Player",
  joinLabel: "Join game",
  classLabel: "Team",
  classFallback: "",
  codeExample: "QUIZ",
};

/** Derive every colour token from a background and an accent. */
function deriveColors(spec: ThemeSpec): Omit<Record<ColorToken, string>, "cell" | "cellInk" | "gap"> {
  const { bg, accent } = spec;
  const dark = isDark(bg);
  const ink = dark ? "#ffffff" : "#0b0d12";
  // A whisper of the accent in the surfaces keeps a custom palette feeling
  // like one thing rather than grey boxes on a coloured page.
  const tinted = mix(bg, accent, dark ? 0.05 : 0.03);
  const up = (t: number) => mix(tinted, ink, t);

  return {
    bg,
    panel: up(0.035),
    panelDeep: up(0.018),
    tile: up(0.06),
    surface: up(0.1),
    surfaceDeep: up(0.05),
    edge: up(0.24),
    edgeSoft: up(0.18),
    line: up(0.14),
    lineSoft: up(0.08),
    lineFaint: up(0.1),
    text: mix(bg, ink, 0.94),
    dim: mix(bg, ink, 0.66),
    muted: mix(bg, ink, 0.58),
    mutedDeep: mix(bg, ink, 0.5),
    dimmer: mix(bg, ink, 0.44),
    faint: mix(bg, ink, 0.38),
    accent,
    accentDeep: mix(accent, bg, 0.45),
    accentSoft: mix(accent, dark ? "#ffffff" : bg, 0.45),
    onAccent: readableOn(accent, "#ffffff", mix(bg, "#000000", dark ? 0.5 : 0.85)),
    info: spec.info ?? (dark ? "#6fd3ff" : "#0b7bc0"),
    warn: spec.warn ?? (dark ? "#ff7a59" : "#d0451b"),
    special: spec.special ?? (dark ? "#b79bff" : "#6a3fe0"),
    good: spec.good ?? (dark ? "#5fdc8f" : "#1f8a4c"),
  };
}

function deriveScenes(c: Record<ColorToken, string>, dark: boolean): Record<SceneToken, string> {
  const glow = (color: string, t: number) => mix(c.bg, color, dark ? t : t * 0.7);
  return {
    landing: `radial-gradient(120% 70% at 50% 0%, ${glow(c.accent, 0.16)}, ${c.bg} 70%)`,
    board: `radial-gradient(120% 90% at 50% -20%, ${glow(c.accent, 0.14)} 0%, ${c.bg} 60%)`,
    clue: `linear-gradient(160deg, ${glow(c.accent, 0.1)} 0%, ${c.bg} 65%)`,
    dailyDouble: `radial-gradient(110% 70% at 50% 20%, ${glow(c.special, 0.3)}, ${c.bg} 72%)`,
    final: `radial-gradient(110% 70% at 50% 15%, ${glow(c.special, 0.24)}, ${c.bg} 74%)`,
    results: `radial-gradient(110% 60% at 50% 10%, ${glow(c.special, 0.18)}, ${c.bg} 72%)`,
    winner: `radial-gradient(90% 60% at 50% 35%, ${glow(c.accent, 0.3)}, ${c.bg} 72%)`,
  };
}

function build(spec: ThemeSpec, id = spec.id, presetId = spec.id): Theme {
  const dark = isDark(spec.bg);
  const base = { ...deriveColors(spec), ...spec.colors };
  // The board defaults to the theme's raised surface, set in its text colour,
  // with no bezel — so a theme that says nothing about it looks as it always has.
  const colors: Record<ColorToken, string> = {
    ...base,
    cell: spec.colors?.cell ?? base.surface,
    cellInk: spec.colors?.cellInk ?? (spec.colors?.cell ? readableOn(spec.colors.cell) : base.text),
    gap: spec.colors?.gap ?? "transparent",
  };
  const font = fontById(spec.font);
  const text = spec.textFont ? fontById(spec.textFont) : font;
  const name = spec.nameFont ? fontById(spec.nameFont) : null;
  return {
    id,
    presetId,
    name: spec.name,
    dark,
    colors,
    tints: spec.tints ?? [colors.info, colors.accent, colors.warn, colors.special, colors.good, dark ? "#ff8fc0" : "#d6336c"],
    fonts: { display: font.stack, text: text.stack, name: name?.stack ?? BODY_FONT, body: BODY_FONT, mono: MONO_FONT },
    fontId: font.id,
    fontIds: [...new Set([font.id, text.id, ...(name ? [name.id] : [])])],
    displayWeight: font.weight ?? 700,
    textWeight: text.weight ?? 700,
    nameScale: name?.scale ?? 1,
    corners: spec.corners ?? "soft",
    shadow: spec.shadow ?? "glow",
    caps: spec.caps ?? false,
    clueCaps: spec.clueCaps ?? false,
    mark: spec.mark ?? "",
    scenes: { ...deriveScenes(colors, dark), ...spec.scenes },
    copy: { ...DEFAULT_COPY, ...spec.copy },
    classes: spec.classes ?? [],
  };
}

/* ------------------------------------------------------------------ */
/* Presets                                                              */
/* ------------------------------------------------------------------ */

/**
 * The signature look: a late-90s quiz-show set. Bright royal-blue "monitor"
 * screens behind black bezels, gold values with hard drop shadows, clues in a
 * white serif and contestants' names in handwriting, on a flat violet stage.
 *
 * Evocative, not copied: the faces are free look-alikes (Anton for the values,
 * Merriweather for the clues, Caveat for the names), and there is no logo,
 * show artwork or show audio anywhere.
 */
const jeoparty: ThemeSpec = {
  id: "jeoparty",
  name: "Jeoparty",
  bg: "#0b0630",
  accent: "#ffc93c",
  font: "anton",
  textFont: "merriweather",
  nameFont: "caveat",
  corners: "soft",
  shadow: "hard",
  caps: true,
  clueCaps: true,
  colors: {
    panel: "#140c4a",
    panelDeep: "#0f083c",
    tile: "#1a1160",
    surface: "#271a86",
    surfaceDeep: "#120a44",
    edge: "#5244c2",
    edgeSoft: "#3f33a8",
    line: "#30278c",
    lineSoft: "#1f1768",
    lineFaint: "#261c76",
    text: "#ffffff",
    dim: "#c6c0f6",
    muted: "#b0a8ec",
    mutedDeep: "#8f86d2",
    dimmer: "#8279c6",
    faint: "#6d64b0",
    accentDeep: "#a87b12",
    accentSoft: "#ffe39a",
    onAccent: "#140a3c",
    cell: "#0b1de0",
    cellInk: "#ffffff",
    gap: "#000000",
  },
  info: "#7fd6ff",
  warn: "#ff5a4a",
  special: "#d77bff",
  good: "#5be37f",
  tints: ["#7fd6ff", "#ffc93c", "#ff7a4d", "#d77bff", "#5be37f", "#ff92c8"],
  scenes: {
    landing:
      "conic-gradient(from 180deg at 18% -6%, transparent 0deg 326deg, rgba(160,130,255,.22) 336deg, transparent 346deg), conic-gradient(from 180deg at 82% -6%, transparent 0deg 14deg, rgba(120,200,255,.18) 24deg, transparent 34deg), radial-gradient(120% 80% at 50% 0%, #2a1785 0%, #0b0630 65%)",
    board:
      "radial-gradient(70% 45% at 50% 0%, rgba(130,100,255,.25), transparent 70%), radial-gradient(120% 70% at 50% 115%, #1d1066 0%, transparent 60%), linear-gradient(180deg, #0e0838, #07041f)",
    clue:
      "repeating-linear-gradient(0deg, rgba(0,0,0,.10) 0px, rgba(0,0,0,.10) 2px, transparent 2px, transparent 4px), radial-gradient(130% 100% at 50% 40%, #1d36ff 0%, #0b1de0 45%, #0614a6 100%)",
    dailyDouble:
      "radial-gradient(closest-side at 50% 50%, transparent 40%, rgba(6,2,30,.8) 100%), conic-gradient(from 20deg at 50% 50%, #2410a8, #6b22c9, #0b1de0, #b0249f, #3b12b8, #0b1de0, #2410a8)",
    final:
      "repeating-linear-gradient(0deg, rgba(0,0,0,.08) 0px, rgba(0,0,0,.08) 2px, transparent 2px, transparent 4px), radial-gradient(110% 80% at 50% 30%, #1529e8 0%, #0818b0 50%, #040b5c 100%)",
    results: "radial-gradient(110% 70% at 50% 10%, #2c1890, #0b0630 72%)",
    winner: "radial-gradient(90% 60% at 50% 35%, #6b4a08, #1b1005 72%)",
  },
};

/** Dark navy and gold — the previous default. */
const classic: ThemeSpec = {
  id: "classic",
  name: "Classic",
  bg: "#04081c",
  accent: "#ffcc33",
  font: "oswald",
  corners: "soft",
  caps: true,
  colors: {
    panel: "#0a1233",
    panelDeep: "#060c22",
    tile: "#0d1740",
    surface: "#132257",
    surfaceDeep: "#0a1339",
    edge: "#3a4d96",
    edgeSoft: "#2b3a78",
    line: "#2a3a7a",
    lineSoft: "#1a2557",
    lineFaint: "#1e2a63",
    text: "#f2f4ff",
    dim: "#9aa6d4",
    muted: "#8b98cc",
    mutedDeep: "#6b78ab",
    dimmer: "#6f7cb0",
    faint: "#566196",
    accentDeep: "#a3781a",
    accentSoft: "#ffe89a",
    onAccent: "#06102e",
  },
  info: "#6fd3ff",
  warn: "#ff7a45",
  special: "#c39bff",
  good: "#6fdc8c",
  tints: ["#6fd3ff", "#ffcc33", "#ff7a45", "#c39bff", "#6fdc8c", "#ff92c2"],
  scenes: {
    landing: "radial-gradient(120% 70% at 50% 0%, #16276b, #04081c 70%)",
    board: "radial-gradient(120% 90% at 50% -20%, #17297a 0%, #08103a 55%, #04081c 100%)",
    clue: "linear-gradient(160deg,#132257 0%,#0a1339 60%,#050a20 100%)",
    dailyDouble: "radial-gradient(110% 70% at 50% 20%, #4a2d7a, #0a0620 72%)",
    final: "radial-gradient(110% 70% at 50% 15%, #2b1f6e, #04061a 74%)",
    results: "radial-gradient(110% 60% at 50% 10%, #241a5c, #05061a 72%)",
    winner: "radial-gradient(90% 60% at 50% 35%, #4a3608, #1c1405 72%)",
  },
};

/**
 * The original look: deep navy, gold, sci-fi fireteam flavour. Also what a
 * board saved before themes existed renders as, so its palette stays put.
 */
const destiny: ThemeSpec = {
  id: "destiny",
  name: "Guardian",
  bg: "#05070c",
  accent: "#f0c469",
  font: "chakra",
  corners: "cut",
  caps: true,
  colors: {
    panel: "#0a0d15",
    panelDeep: "#070a11",
    tile: "#0d1219",
    surface: "#141b28",
    surfaceDeep: "#0f141d",
    edge: "#2f3a4f",
    edgeSoft: "#26303f",
    line: "#232b3c",
    lineSoft: "#1a2130",
    lineFaint: "#1e2635",
    text: "#e8ecf4",
    dim: "#8b95ab",
    muted: "#7d879c",
    mutedDeep: "#6b7488",
    dimmer: "#5f6a80",
    faint: "#4f596d",
    accentDeep: "#8a6f2c",
    accentSoft: "#ffe0a0",
    onAccent: "#0a0d14",
  },
  info: "#7fd8f0",
  warn: "#f0803c",
  special: "#b18cf0",
  good: "#8fd98a",
  tints: ["#7fd8f0", "#f0c469", "#f0803c", "#b18cf0", "#8fd98a", "#ff8fb0"],
  scenes: {
    landing: "radial-gradient(120% 70% at 50% 0%, #17203a, #05070c 70%)",
    board: "radial-gradient(120% 90% at 50% -20%, #17203a 0%, #0a0d16 55%, #06080e 100%)",
    clue: "linear-gradient(160deg,#0d1526 0%,#080b12 60%,#0b0910 100%)",
    dailyDouble: "radial-gradient(110% 70% at 50% 20%, #2a1d47, #08070f 72%)",
    final: "radial-gradient(110% 70% at 50% 15%, #241a44, #07060d 74%)",
    results: "radial-gradient(110% 60% at 50% 10%, #1d1533, #08070f 72%)",
    winner: "radial-gradient(90% 60% at 50% 35%, #3a2408, #17100a 72%)",
  },
  copy: {
    appName: "Guardian Jeoparty",
    tagline: "Fireteam trivia system",
    defaultPlayerName: "Guardian",
    joinLabel: "Join the fireteam",
    classLabel: "Class",
    classFallback: "Guardian",
    codeExample: "VEX7",
  },
  classes: ["Titan", "Hunter", "Warlock"],
};

const midnight: ThemeSpec = {
  id: "midnight",
  name: "Midnight",
  bg: "#070b0e",
  accent: "#4dd6c1",
  font: "grotesk",
  corners: "soft",
  caps: false,
  info: "#6cc6ff",
  warn: "#ff8a5c",
  special: "#a98cff",
  good: "#7ee08a",
  tints: ["#4dd6c1", "#6cc6ff", "#ff8a5c", "#a98cff", "#7ee08a", "#ff8fb0"],
};

const neon: ThemeSpec = {
  id: "neon",
  name: "Neon",
  bg: "#0b0615",
  accent: "#ff3ea5",
  font: "bricolage",
  corners: "round",
  caps: false,
  info: "#3ee8ff",
  special: "#a77bff",
  good: "#5cf2a0",
  warn: "#ffb03e",
  tints: ["#3ee8ff", "#ff3ea5", "#ffb03e", "#a77bff", "#5cf2a0", "#fff35c"],
};

const sunset: ThemeSpec = {
  id: "sunset",
  name: "Sunset",
  bg: "#1b0f1c",
  accent: "#ff8c5a",
  font: "fraunces",
  corners: "soft",
  caps: false,
  info: "#7cc8ff",
  special: "#e48bff",
  good: "#8fe3a8",
  warn: "#ff5f6d",
};

const daylight: ThemeSpec = {
  id: "daylight",
  name: "Daylight",
  bg: "#f4f2ec",
  accent: "#3355ff",
  font: "outfit",
  corners: "round",
  caps: false,
};

const PRESETS: readonly ThemeSpec[] = [jeoparty, classic, destiny, midnight, neon, sunset, daylight];

export const THEMES: readonly Theme[] = PRESETS.map((spec) => build(spec));

/** What a board made today gets if its author never opens the Style panel. */
export const DEFAULT_THEME_ID = "jeoparty";

/** What a board saved before themes existed renders as. */
export const LEGACY_THEME_ID = "destiny";

function specById(id: string | undefined | null): ThemeSpec {
  if (!id) return specById(LEGACY_THEME_ID);
  return PRESETS.find((t) => t.id === id) ?? PRESETS.find((t) => t.id === DEFAULT_THEME_ID)!;
}

export function themeById(id: string | undefined | null): Theme {
  const spec = specById(id);
  return THEMES.find((t) => t.id === spec.id)!;
}

const cache = new Map<string, Theme>();

/** A preset with a board's style folded in. */
export function resolveTheme(id: string | undefined | null, style?: BoardStyle | null): Theme {
  const spec = specById(id);
  if (!style || Object.keys(style).length === 0) return themeById(spec.id);

  const key = `${spec.id}:${JSON.stringify(style)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const merged: ThemeSpec = {
    ...spec,
    font: style.font ?? spec.font,
    corners: style.corners ?? spec.corners,
    caps: style.caps ?? spec.caps,
    mark: style.mark ?? spec.mark,
  };
  // A new background invalidates every hand-tuned surface, scene and seat
  // colour in the preset — they were picked against the old one. The board
  // itself is kept: it is the preset's signature, and reads on any page.
  if (style.bg && style.bg !== spec.bg) {
    const board = spec.colors ? { cell: spec.colors.cell, cellInk: spec.colors.cellInk, gap: spec.colors.gap } : {};
    merged.bg = style.bg;
    merged.colors = Object.fromEntries(Object.entries(board).filter(([, v]) => v)) as ThemeSpec["colors"];
    merged.scenes = undefined;
    merged.tints = undefined;
    if (isDark(style.bg) !== isDark(spec.bg)) {
      merged.info = merged.warn = merged.special = merged.good = undefined;
    }
  }
  if (style.accent && style.accent !== spec.accent) {
    merged.accent = style.accent;
    if (merged.colors) {
      const { accentDeep: _d, accentSoft: _s, onAccent: _o, ...rest } = merged.colors;
      merged.colors = rest;
    }
    if (merged.tints) merged.tints = [merged.tints[0], style.accent, ...merged.tints.slice(2)] as unknown as Tints;
    if (merged.scenes) {
      const { winner: _w, ...rest } = merged.scenes;
      merged.scenes = rest;
    }
  }
  if (style.board) {
    merged.colors = { ...merged.colors, cell: style.board, cellInk: readableOn(style.board) };
    // The clue screen is the board's colour blown up to full screen.
    if (merged.scenes?.clue) {
      merged.scenes = {
        ...merged.scenes,
        clue: `radial-gradient(130% 100% at 50% 40%, ${mix(style.board, "#ffffff", 0.12)} 0%, ${style.board} 45%, ${mix(style.board, "#000000", 0.3)} 100%)`,
      };
    }
  }

  const theme = build(merged, key, spec.id);
  cache.set(key, theme);
  return theme;
}

/* ------------------------------------------------------------------ */
/* CSS                                                                  */
/* ------------------------------------------------------------------ */

const RADII: Record<Corners, { sm: string; md: string; lg: string; btn: string }> = {
  sharp: { sm: "0px", md: "0px", lg: "0px", btn: "0px" },
  cut: { sm: "0px", md: "0px", lg: "0px", btn: "0px" },
  soft: { sm: "6px", md: "10px", lg: "16px", btn: "10px" },
  round: { sm: "10px", md: "16px", lg: "24px", btn: "999px" },
};

/** The theme as a block of custom properties for a `<style>` tag. */
export function themeCss(theme: Theme, selector = ":root"): string {
  const lines: string[] = [];
  for (const [token, value] of Object.entries(theme.colors)) lines.push(`--c-${kebab(token)}:${value};`);
  theme.tints.forEach((tint, i) => lines.push(`--tint-${i}:${tint};`));
  for (const [token, value] of Object.entries(theme.scenes)) lines.push(`--scene-${kebab(token)}:${value};`);
  const r = RADII[theme.corners];
  const hard = theme.shadow === "hard";
  // A theme with a bezel colour gets a wall of monitors: no accent rule over
  // the categories, and a played clue leaves its screen blank rather than dark.
  const monitors = theme.colors.gap !== "transparent";
  lines.push(
    `--font-display:${theme.fonts.display};`,
    `--font-text:${theme.fonts.text};`,
    `--font-name:${theme.fonts.name};`,
    `--font-body:${theme.fonts.body};`,
    `--font-mono:${theme.fonts.mono};`,
    `--display-weight:${theme.displayWeight};`,
    `--text-weight:${theme.textWeight};`,
    `--name-scale:${theme.nameScale};`,
    `--cat-rule:${monitors ? "0px solid transparent" : `3px solid ${theme.colors.accent}`};`,
    `--cell-line:${monitors ? "rgba(255,255,255,.08)" : theme.colors.edgeSoft};`,
    `--cell-spent:${monitors ? `color-mix(in srgb, ${theme.colors.cell}, #000 22%)` : `color-mix(in srgb, ${theme.colors.panelDeep} 70%, transparent)`};`,
    `--r-sm:${r.sm};--r-md:${r.md};--r-lg:${r.lg};--r-btn:${r.btn};`,
    `--cut:${theme.corners === "cut" ? "polygon(0 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%)" : "none"};`,
    `--caps:${theme.caps ? "uppercase" : "none"};`,
    `--caps-track:${theme.caps ? ".03em" : "-.01em"};`,
    `--clue-case:${theme.clueCaps ? "uppercase" : "none"};`,
    `--broadcast:${hard ? "0.07em 0.07em 0 rgba(0,0,0,.9)" : "none"};`,
    `--value-shadow:${hard ? "0.06em 0.06em 0 #000" : `0 0 .45em color-mix(in srgb, ${theme.colors.accent} 30%, transparent)`};`,
    `--bg:${theme.colors.bg};`,
    `--flash-up:${theme.colors.good};`,
    `--flash-down:${theme.colors.warn};`,
    `--shadow:${theme.dark ? "0 10px 30px rgba(0,0,0,.45)" : "0 10px 30px rgba(20,24,40,.12)"};`,
    `color-scheme:${theme.dark ? "dark" : "light"};`,
  );
  return `${selector}{${lines.join("")}}`;
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
