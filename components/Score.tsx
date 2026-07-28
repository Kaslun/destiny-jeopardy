"use client";

import { money } from "../lib/theme";
import { useAnimatedNumber } from "../lib/useAnimatedNumber";

/**
 * A score that climbs to its new value and flashes the direction it moved.
 * Used everywhere a score appears, so the room reads a change the same way on
 * every screen.
 */
export function Score({
  value,
  style,
  negativeColor = "#f0803c",
  positiveColor = "#e8ecf4",
}: {
  value: number;
  style?: React.CSSProperties;
  negativeColor?: string;
  positiveColor?: string;
}) {
  const { display, direction } = useAnimatedNumber(value);

  return (
    <span
      key={direction ?? "idle"}
      className={direction === "up" ? "flash-up" : direction === "down" ? "flash-down" : undefined}
      style={{
        display: "inline-block",
        fontVariantNumeric: "tabular-nums",
        color: display < 0 ? negativeColor : positiveColor,
        ...style,
      }}
    >
      {money(display)}
    </span>
  );
}
