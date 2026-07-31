"use client";

/**
 * Namespaced `localStorage`, with a one-time move off the old prefix.
 *
 * Everything the browser remembers — your player id and seat, the boards you
 * made, the draft you have not saved — was stored under a prefix named after
 * the original theme. Renaming it without carrying the values across would
 * silently sign people out of their own boards and hand returning phones a new
 * player id mid-game, so each key is copied on first read and the old one is
 * left alone rather than deleted: a browser that downgrades still works.
 */

const PREFIX = "jeopardy/";
const LEGACY_PREFIX = "guardian-jeopardy/";

export type StorageKey =
  | "player-id"
  | "player-name"
  | "boards"
  | "draft"
  | "editor-name"
  | "muted"
  /** Per-room: the secret that proves you are this room's host. */
  | "host-key"
  /** Per-board: the secret that lets you write to it. */
  | "edit-key";

/** Keys that name a particular room or board take a `scope`. */
function full(key: StorageKey, scope?: string): string {
  return scope ? `${key}/${scope}` : key;
}

export function read(key: StorageKey, scope?: string): string | null {
  const name = full(key, scope);
  try {
    const current = localStorage.getItem(PREFIX + name);
    if (current !== null) return current;

    const legacy = localStorage.getItem(LEGACY_PREFIX + name);
    if (legacy === null) return null;
    // Carry it forward on the way past, so this only ever costs one read.
    localStorage.setItem(PREFIX + name, legacy);
    return legacy;
  } catch {
    // Private mode, or storage disabled. Callers all treat null as "first time
    // here", which is the right behaviour in that case too.
    return null;
  }
}

export function write(key: StorageKey, value: string, scope?: string): void {
  try {
    localStorage.setItem(PREFIX + full(key, scope), value);
  } catch {
    /* nothing here is worth failing a game over */
  }
}

/** Read and parse JSON, or get `null` back if it is missing or corrupt. */
export function readJson<T>(key: StorageKey, scope?: string): T | null {
  const raw = read(key, scope);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: StorageKey, value: unknown, scope?: string): void {
  write(key, JSON.stringify(value), scope);
}
