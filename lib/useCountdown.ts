"use client";

import { useEffect, useRef, useState } from "react";

export interface Countdown {
  /** Still in the read delay — the clue is up but the buzzers are not open. */
  waiting: boolean;
  /** Whole seconds until the buzzers open. Zero once they have. */
  waitRemaining: number;
  /** 1 → 0 across the read delay. */
  waitFraction: number;
  /** Whole seconds left on the clue. Stays full for the whole read delay. */
  remaining: number;
  expired: boolean;
  /** 1 → 0 across the clue's own time. */
  fraction: number;
}

/**
 * Counts a clue through both of its phases: being read, then being answered.
 *
 * One clock rather than two. The read delay and the clue's own time are
 * consecutive stretches of the same countdown, so they cannot drift apart or
 * both claim to be running — which two independent timers, started a render
 * apart, absolutely would.
 *
 * Time is measured from when `shownAt` *changes*, not from the server's epoch,
 * so a viewer whose system clock is minutes out still sees a full, correct bar.
 * The server separately refuses early and late buzzes against its own clock —
 * this is for display, and never decides a rule.
 */
export function useCountdown(shownAt: number | null, seconds: number, delaySeconds = 0): Countdown {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (shownAt === null) {
      setElapsed(0);
      return;
    }
    startedAt.current = performance.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(performance.now() - startedAt.current), 100);
    return () => clearInterval(id);
  }, [shownAt]);

  const delay = Math.max(0, delaySeconds) * 1000;
  const total = Math.max(seconds, 1) * 1000;

  if (shownAt === null) {
    return {
      waiting: false,
      waitRemaining: 0,
      waitFraction: 0,
      remaining: seconds,
      expired: false,
      fraction: 1,
    };
  }

  const waiting = elapsed < delay;
  const waitLeft = Math.max(0, delay - elapsed);
  // The clue's own clock does not start until the read delay is spent.
  const left = Math.max(0, total - Math.max(0, elapsed - delay));

  return {
    waiting,
    waitRemaining: Math.ceil(waitLeft / 1000),
    waitFraction: delay > 0 ? waitLeft / delay : 0,
    remaining: Math.ceil(left / 1000),
    // Never "expired" while the room is still being read to.
    expired: !waiting && left <= 0,
    fraction: left / total,
  };
}
