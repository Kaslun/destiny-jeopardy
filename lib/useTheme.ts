"use client";

import { useEffect } from "react";
import { themeById, themeCss, type Theme } from "./themes";

/** The one `<style>` element every surface writes its palette into. */
const ELEMENT_ID = "theme-vars";

/**
 * Mount a theme, and get its words back.
 *
 * The palette is applied as a side effect on `document.head` rather than as
 * rendered markup, because the surfaces that need it — the TV especially —
 * return from half a dozen different branches depending on what the room is
 * doing. A hook applies once from the top of the component and cannot be
 * forgotten in the branch nobody tested.
 *
 * Written into the head so it lands after the root layout's base block and
 * therefore wins, and reused across surfaces so navigating between them swaps
 * the palette instead of stacking blocks that fight each other.
 */
export function useTheme(id: string | undefined | null): Theme {
  const theme = themeById(id);

  useEffect(() => {
    let el = document.getElementById(ELEMENT_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = ELEMENT_ID;
      document.head.appendChild(el);
    }
    el.dataset.theme = theme.id;
    el.textContent = themeCss(theme);
  }, [theme]);

  return theme;
}
