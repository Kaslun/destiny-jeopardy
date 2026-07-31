"use client";

import { keyFor } from "./keys";
import { readJson, writeJson } from "./storage";
import type { Game } from "../shared/protocol";

const PARTY_HOST = process.env.NEXT_PUBLIC_PARTY_HOST || "127.0.0.1:8787";
const isLocal = /^(127\.|localhost|0\.0\.0\.0)/.test(PARTY_HOST);
const BASE = `${isLocal ? "http" : "https"}://${PARTY_HOST}`;

export async function loadBoard(slug: string): Promise<Game> {
  const res = await fetch(`${BASE}/boards/${encodeURIComponent(slug.toUpperCase())}`);
  const body = (await res.json().catch(() => ({}))) as { game?: Game; error?: string };
  if (!res.ok || !body.game) throw new Error(body.error ?? `could not load board ${slug}`);
  return body.game;
}

export async function saveBoard(slug: string, game: Game): Promise<void> {
  const code = slug.toUpperCase();
  const res = await fetch(`${BASE}/boards/${encodeURIComponent(code)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    // Writing needs the board's key; reading never does. A board created here
    // mints one on the spot and thereby claims itself.
    body: JSON.stringify({ game, key: keyFor("edit-key", code) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "could not save this board");
  }
}

/* ---- local index of boards made in this browser ----
   There is no cross-object listing on the server, so each browser remembers
   the slugs it created. Losing this loses the list, not the boards. */

export interface BoardRef {
  slug: string;
  title: string;
  savedAt: number;
}

export function myBoards(): BoardRef[] {
  return readJson<BoardRef[]>("boards") ?? [];
}

export function rememberBoard(ref: BoardRef): void {
  writeJson("boards", [ref, ...myBoards().filter((b) => b.slug !== ref.slug)].slice(0, 30));
}
