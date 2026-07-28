"use client";

import { useEffect, useRef, useState } from "react";

export interface Countdown {
  remaining: number;
  expired: boolean;
  fraction: number;
}

/**
 * Counts down a clue locally.
 *
 * The clock starts when `openedAt` changes rather than from the server's epoch,
 * so a viewer whose system clock is minutes out still sees a full, correct bar.
 * The server separately refuses late buzzes using its own clock — this is for
 * display, not for rules.
 */
export function useCountdown(openedAt: number | null, seconds: number): Countdown {
  const [now, setNow] = useState(0);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (openedAt === null) {
      setNow(0);
      return;
    }
    startedAt.current = performance.now();
    setNow(0);
    const id = setInterval(() => setNow(performance.now() - startedAt.current), 100);
    return () => clearInterval(id);
  }, [openedAt]);

  if (openedAt === null) return { remaining: seconds, expired: false, fraction: 1 };

  const total = Math.max(seconds, 1) * 1000;
  const left = Math.max(0, total - now);
  return {
    remaining: Math.ceil(left / 1000),
    expired: left <= 0,
    fraction: left / total,
  };
}
