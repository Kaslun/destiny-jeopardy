"use client";

import { C } from "../lib/theme";
import { Icon } from "./ui";

/**
 * Prompt to switch the room's audio on. Browsers will not start audio until
 * someone interacts with the page, and the TV is the one screen nobody
 * touches — so without this every cue is silently dropped.
 */
export function SoundGate({ onEnable, onMute }: { onEnable: () => void; onMute: () => void }) {
  return (
    <div
      className="float"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "clamp(16px,3vh,40px)",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 8,
        animation: "riseFade .4s var(--snap) both",
      }}
    >
      <button onClick={onEnable} className="btn btn-primary btn-lg">
        <Icon name="volume" /> Turn on sound
      </button>
      <button onClick={onMute} className="btn btn-ghost btn-lg" style={{ color: C.muted }}>
        Play silent
      </button>
    </div>
  );
}
