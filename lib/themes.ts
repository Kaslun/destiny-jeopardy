/**
 * Themes.
 *
 * A theme is three things: a palette, a pair of typefaces, and the words the
 * game uses about itself. The palette and the typefaces ship as CSS custom
 * properties — every surface styles itself with `var(--c-…)` through the `C`
 * map in `lib/theme.ts`, so switching a theme is a variable swap with no
 * re-render and no component knowing it happened. The words cannot be CSS, so
 * they are read off the theme object directly.
 *
 * Tokens are named for their *role*, never their colour. `accent` is whatever
 * this theme uses for values and primary actions; in one theme that is gold and
 * in another it is teal. A token called `gold` would have to lie in every theme
 * but one, and the lie spreads: the next person reads `C.gold` and picks gold.
 */

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
  | "good";

/**
 * Full-bleed page backgrounds.
 *
 * These carry a theme's mood more than any single token does, so they are
 * authored per theme as complete CSS `background` values rather than being
 * derived from the palette — a gradient built by formula from two tokens looks
 * like exactly that.
 */
export type SceneToken =
  | "landing"
  | "board"
  | "clue"
  | "dailyDouble"
  | "final"
  | "results"
  | "winner";

/** How many seat colours every theme provides. */
export const TINT_COUNT = 6;

export type Tints = readonly [string, string, string, string, string, string];

/** The words a theme puts in the game's mouth. */
export interface ThemeCopy {
  /** The game's name, on the landing page and as a board's default title. */
  appName: string;
  /** The small line that sits above the name. */
  tagline: string;
  /** What a player is called when they don't type a name. */
  defaultPlayerName: string;
  /** The phone's join button. */
  joinLabel: string;
  /** What the roster's second line is called — "class", "house", "team". */
  classLabel: string;
  /** Shown against a player who has joined but set no class. */
  classFallback: string;
  /** Placeholder in the landing page's room-code field. */
  codeExample: string;
}

export interface Theme {
  id: string;
  /** Shown in the theme picker. */
  name: string;
  /** One line on what it looks like, also in the picker. */
  blurb: string;
  colors: Record<ColorToken, string>;
  /** Per-player accents, cycled by seat. Fixed length so `tintFor` can name
   *  a variable without knowing which theme is live. */
  tints: Tints;
  fonts: { display: string; mono: string };
  scenes: Record<SceneToken, string>;
  copy: ThemeCopy;
  /** Offered in the join form's class picker. Empty means free text. */
  classes: readonly string[];
}

/* ------------------------------------------------------------------ */

/**
 * The original look: deep navy, gold, and the flavour it was written with.
 *
 * This is also the fallback for boards saved before themes existed, so it must
 * stay pixel-identical to what those boards have always rendered as.
 */
const destiny: Theme = {
  id: "destiny",
  name: "Guardian",
  blurb: "Deep navy and gold. Sci-fi fireteam flavour.",
  colors: {
    bg: "#05070c",
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
    accent: "#f0c469",
    accentDeep: "#8a6f2c",
    accentSoft: "#ffe0a0",
    onAccent: "#0a0d14",
    info: "#7fd8f0",
    warn: "#f0803c",
    special: "#b18cf0",
    good: "#8fd98a",
  },
  tints: ["#7fd8f0", "#f0c469", "#f0803c", "#b18cf0", "#8fd98a", "#ff8fb0"],
  fonts: {
    display: "'Chakra Petch', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
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
    appName: "GUARDIAN JEOPARDY",
    tagline: "FIRETEAM TRIVIA SYSTEM",
    defaultPlayerName: "GUARDIAN",
    joinLabel: "JOIN THE FIRETEAM",
    classLabel: "CLASS",
    classFallback: "GUARDIAN",
    codeExample: "VEX7",
  },
  classes: ["TITAN", "HUNTER", "WARLOCK"],
};

/** The look the game is actually named after: royal blue board, gold values. */
const classic: Theme = {
  id: "classic",
  name: "Classic",
  blurb: "Royal blue and gold, the way the show does it.",
  colors: {
    bg: "#04081c",
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
    accent: "#ffcc33",
    accentDeep: "#a3781a",
    accentSoft: "#ffe89a",
    onAccent: "#06102e",
    info: "#6fd3ff",
    warn: "#ff7a45",
    special: "#c39bff",
    good: "#6fdc8c",
  },
  tints: ["#6fd3ff", "#ffcc33", "#ff7a45", "#c39bff", "#6fdc8c", "#ff92c2"],
  fonts: {
    display: "'Oswald', 'Arial Narrow', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  scenes: {
    landing: "radial-gradient(120% 70% at 50% 0%, #16276b, #04081c 70%)",
    board: "radial-gradient(120% 90% at 50% -20%, #17297a 0%, #08103a 55%, #04081c 100%)",
    clue: "linear-gradient(160deg,#132257 0%,#0a1339 60%,#050a20 100%)",
    dailyDouble: "radial-gradient(110% 70% at 50% 20%, #4a2d7a, #0a0620 72%)",
    final: "radial-gradient(110% 70% at 50% 15%, #2b1f6e, #04061a 74%)",
    results: "radial-gradient(110% 60% at 50% 10%, #241a5c, #05061a 72%)",
    winner: "radial-gradient(90% 60% at 50% 35%, #4a3608, #1c1405 72%)",
  },
  copy: {
    appName: "JEOPARDY NIGHT",
    tagline: "A BUZZER GAME FOR A ROOM FULL OF PHONES",
    defaultPlayerName: "PLAYER",
    joinLabel: "JOIN THE GAME",
    classLabel: "TEAM",
    classFallback: "PLAYER",
    codeExample: "QUIZ",
  },
  classes: [],
};

/** Neutral and quiet: slate and teal, no flavour of its own. */
const midnight: Theme = {
  id: "midnight",
  name: "Midnight",
  blurb: "Slate and teal. Understated, no flavour.",
  colors: {
    bg: "#070b0e",
    panel: "#0d1418",
    panelDeep: "#090f13",
    tile: "#101a20",
    surface: "#16232b",
    surfaceDeep: "#101a20",
    edge: "#31454f",
    edgeSoft: "#283840",
    line: "#24343d",
    lineSoft: "#1a262d",
    lineFaint: "#1e2c34",
    text: "#e6f0f2",
    dim: "#8fa3aa",
    muted: "#7e9199",
    mutedDeep: "#66787f",
    dimmer: "#63777e",
    faint: "#4e6068",
    accent: "#4dd6c1",
    accentDeep: "#1f7a6d",
    accentSoft: "#a8f0e5",
    onAccent: "#04100e",
    info: "#6cc6ff",
    warn: "#ff8a5c",
    special: "#a98cff",
    good: "#7ee08a",
  },
  tints: ["#4dd6c1", "#6cc6ff", "#ff8a5c", "#a98cff", "#7ee08a", "#ff8fb0"],
  fonts: {
    display: "'Space Grotesk', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  scenes: {
    landing: "radial-gradient(120% 70% at 50% 0%, #12303a, #070b0e 70%)",
    board: "radial-gradient(120% 90% at 50% -20%, #123039 0%, #0b171c 55%, #070b0e 100%)",
    clue: "linear-gradient(160deg,#0f2028 0%,#0a1216 60%,#080d10 100%)",
    dailyDouble: "radial-gradient(110% 70% at 50% 20%, #2b2350, #07070f 72%)",
    final: "radial-gradient(110% 70% at 50% 15%, #1e2a52, #06080d 74%)",
    results: "radial-gradient(110% 60% at 50% 10%, #171f3a, #06080d 72%)",
    winner: "radial-gradient(90% 60% at 50% 35%, #0d3d36, #071815 72%)",
  },
  copy: {
    appName: "JEOPARDY NIGHT",
    tagline: "A BUZZER GAME FOR A ROOM FULL OF PHONES",
    defaultPlayerName: "PLAYER",
    joinLabel: "JOIN THE GAME",
    classLabel: "TEAM",
    classFallback: "PLAYER",
    codeExample: "QUIZ",
  },
  classes: [],
};

/* ------------------------------------------------------------------ */

export const THEMES: readonly Theme[] = [classic, destiny, midnight];

/** What a board made today gets if its author never opens the theme picker. */
export const DEFAULT_THEME_ID = "classic";

/**
 * What a board saved *before* themes existed renders as.
 *
 * Those boards have no `theme` field and have always looked like the original
 * design, so that is what they keep looking like. Only new boards inherit the
 * neutral default.
 */
export const LEGACY_THEME_ID = "destiny";

export function themeById(id: string | undefined | null): Theme {
  if (!id) return themeById(LEGACY_THEME_ID);
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
}

/**
 * The theme as a CSS declaration block, for injection into a `<style>` tag.
 *
 * Emitted as custom properties rather than being applied to elements, because
 * every component already styles itself through `var(--c-…)`. Swapping themes
 * is then one text node changing, not a tree re-rendering.
 */
export function themeCss(theme: Theme, selector = ":root"): string {
  const lines: string[] = [];
  for (const [token, value] of Object.entries(theme.colors)) {
    lines.push(`--c-${kebab(token)}:${value};`);
  }
  theme.tints.forEach((tint, i) => lines.push(`--tint-${i}:${tint};`));
  lines.push(`--tint-count:${theme.tints.length};`);
  for (const [token, value] of Object.entries(theme.scenes)) {
    lines.push(`--scene-${kebab(token)}:${value};`);
  }
  lines.push(`--font-display:${theme.fonts.display};`);
  lines.push(`--font-mono:${theme.fonts.mono};`);
  // globals.css styles the page shell off these two.
  lines.push(`--bg:${theme.colors.bg};`);
  lines.push(`--flash-up:${theme.colors.good};`);
  lines.push(`--flash-down:${theme.colors.warn};`);
  return `${selector}{${lines.join("")}}`;
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
