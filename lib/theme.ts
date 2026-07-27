/** Design tokens lifted from `design/Guardian Jeopardy.dc.html`. */

export const C = {
  bg: "#05070c",
  panel: "#0a0d15",
  panelDeep: "#070a11",
  tile: "#0d1219",
  line: "#232b3c",
  lineSoft: "#1a2130",
  text: "#e8ecf4",
  dim: "#8b95ab",
  dimmer: "#5f6a80",
  faint: "#4f596d",
  gold: "#f0c469",
  goldDeep: "#8a6f2c",
  cyan: "#7fd8f0",
  orange: "#f0803c",
  violet: "#b18cf0",
  green: "#8fd98a",
} as const;

export const TINTS = [C.cyan, C.gold, C.orange, C.violet, C.green, "#ff8fb0"] as const;

export const mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
export const display = "'Chakra Petch', system-ui, sans-serif";

export function tintFor(index: number): string {
  return TINTS[index % TINTS.length];
}

export function money(n: number): string {
  return (n < 0 ? "−" : "") + Math.abs(n).toLocaleString();
}

/** Six-character room codes, no vowels — avoids accidental words. */
export function newRoomCode(): string {
  const alphabet = "BCDFGHJKLMNPQRSTVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
