"use client";

import { useEffect } from "react";
import { fontById, resolveTheme, themeCss, type Theme } from "./themes";
import type { BoardStyle } from "../shared/protocol";

/** The one `<style>` element every surface writes its palette into. */
const ELEMENT_ID = "theme-vars";

/** Faces the root layout already requests, so they are never fetched twice. */
const PRELOADED = new Set(["oswald"]);

/** Request a display face from Google Fonts the first time a theme needs it. */
function ensureFont(id: string): void {
  if (PRELOADED.has(id)) return;
  const font = fontById(id);
  const elId = `font-${font.id}`;
  if (document.getElementById(elId)) return;
  const link = document.createElement("link");
  link.id = elId;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  document.head.appendChild(link);
}

/**
 * Mount a theme — a preset plus any board style — and get it back.
 *
 * Applied as a side effect on `document.head` rather than as markup, because
 * the surfaces that need it return from many branches and a hook at the top
 * cannot be forgotten in the one nobody tested.
 */
export function useTheme(id: string | undefined | null, style?: BoardStyle | null): Theme {
  const theme = resolveTheme(id, style);

  useEffect(() => {
    ensureFont(theme.fontId);
    let el = document.getElementById(ELEMENT_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = ELEMENT_ID;
      document.head.appendChild(el);
    }
    el.dataset.theme = theme.id;
    el.textContent = themeCss(theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.colors.bg);
  }, [theme]);

  return theme;
}
