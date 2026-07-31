"use client";

import { read, write } from "./storage";

/**
 * Capability keys for hosting a room and editing a board.
 *
 * The model is deliberately not accounts. Nobody signs in to play a party game,
 * and a login screen between someone and a board they made would be worse than
 * the problem it solves. Instead each room and each board has a **secret you
 * either hold or you don't**, and holding it is the whole of the authorisation:
 *
 * - The first host to open a room *claims* it, and thereafter only that secret
 *   can drive it. Anyone else opening `/host/CODE` gets a spectator's view.
 * - A board is readable by anyone with its code — that is the sharing mechanism
 *   and stays open — but writable only with its edit key.
 *
 * The key lives in the URL fragment, which makes it a link you can send to a
 * co-host or open on another device, and which never reaches a server log the
 * way a query string would. It is mirrored into `localStorage` so the ordinary
 * case — same person, same browser, later that evening — needs no link at all.
 *
 * This stops accidents and passers-by, which is the actual threat: someone in
 * the room opening the host console "to see", or a guessed board code
 * overwriting a night's work. It is not a defence against someone determined
 * who already has your link, and it is not trying to be.
 */

function generate(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 22);
}

/** The `#k=…` fragment, if the current URL carries one. */
function fromFragment(): string | null {
  if (typeof window === "undefined") return null;
  const match = /(?:^|[#&])k=([A-Za-z0-9_-]{8,64})/.exec(window.location.hash);
  return match ? match[1] : null;
}

/**
 * Take the key out of the address bar once it is stored.
 *
 * Leaving it there means it rides along into every screenshot of the host
 * console and every "look at this" link someone copies out of the bar. It is
 * already saved by the time this runs, so nothing is lost.
 */
function stripFragment(): void {
  if (typeof window === "undefined" || !window.location.hash) return;
  const kept = window.location.hash
    .replace(/^#/, "")
    .split("&")
    .filter((part) => !part.startsWith("k="))
    .join("&");
  history.replaceState(null, "", window.location.pathname + window.location.search + (kept ? `#${kept}` : ""));
}

type Scope = "host-key" | "edit-key";

/**
 * The key for this room or board: from the link if there is one, else from
 * this browser, else freshly minted.
 *
 * Minting on the spot is what makes claiming work — the first person to open
 * an unclaimed room arrives holding a secret nobody else has, and the server
 * simply records it.
 */
export function keyFor(scope: Scope, id: string): string {
  const shared = fromFragment();
  if (shared) {
    write(scope, shared, id);
    stripFragment();
    return shared;
  }
  const stored = read(scope, id);
  if (stored) return stored;
  const minted = generate();
  write(scope, minted, id);
  return minted;
}

/** Whether this browser already holds a key, without minting one. */
export function hasKey(scope: Scope, id: string): boolean {
  return !!fromFragment() || !!read(scope, id);
}

/** A link that carries the key, for a co-host or a second device. */
export function linkWithKey(path: string, key: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${path}#k=${key}`;
}
