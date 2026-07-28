"use client";

import { useEffect, useRef, useState } from "react";

export interface AnimatedNumber {
  /** The value to render right now, mid-tween. */
  display: number;
  /** "up" | "down" for one beat after a change, then null. */
  direction: "up" | "down" | null;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Counts a score towards its new value instead of snapping.
 *
 * Scores are the one number the room watches, and a jump from 1,200 to 2,400
 * reads as a glitch where a half-second climb reads as a win.
 *
 * The tween always starts from whatever is currently on screen, tracked in a
 * ref that is never rewound on cleanup. That matters: React re-runs effects
 * (StrictMode does it on every mount), and an implementation that reset its
 * origin during cleanup would decide the second run had nothing to do and leave
 * the number frozen at its initial value.
 */
export function useAnimatedNumber(value: number, ms = 550): AnimatedNumber {
  const [display, setDisplay] = useState(value);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const shown = useRef(value);
  const frame = useRef(0);

  useEffect(() => {
    const origin = shown.current;
    if (origin === value) return;

    if (prefersReducedMotion()) {
      shown.current = value;
      setDisplay(value);
      return;
    }

    setDirection(value > origin ? "up" : "down");
    const start = performance.now();
    const delta = value - origin;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // easeOutCubic: quick off the mark, gentle arrival.
      const next = t < 1 ? Math.round(origin + delta * (1 - Math.pow(1 - t, 3))) : value;
      shown.current = next;
      setDisplay(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);

    // requestAnimationFrame is suspended outright in a background tab, so the
    // tween would stall mid-climb and the number would be left wrong. A timer
    // still fires (throttled) and forces the true value, because this is a
    // presentation flourish that must never lose the actual score.
    const settle = setTimeout(() => {
      cancelAnimationFrame(frame.current);
      shown.current = value;
      setDisplay(value);
    }, ms + 200);

    const clearFlash = setTimeout(() => setDirection(null), ms + 250);

    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(settle);
      clearTimeout(clearFlash);
      // `shown` deliberately keeps whatever was last painted, so a re-run picks
      // up from there rather than believing it has already arrived.
    };
  }, [value, ms]);

  return { display, direction };
}
