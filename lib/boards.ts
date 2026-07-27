"use client";

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
  const res = await fetch(`${BASE}/boards/${encodeURIComponent(slug.toUpperCase())}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ game }),
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

const INDEX_KEY = "guardian-jeopardy/boards";

export function myBoards(): BoardRef[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as BoardRef[]) : [];
  } catch {
    return [];
  }
}

export function rememberBoard(ref: BoardRef): void {
  try {
    const next = [ref, ...myBoards().filter((b) => b.slug !== ref.slug)].slice(0, 30);
    localStorage.setItem(INDEX_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the slug is still shown on screen to copy */
  }
}
