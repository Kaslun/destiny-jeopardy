"use client";

import { alpha, C, mono } from "../lib/theme";

/**
 * Prompt to switch the room's audio on.
 *
 * Browsers will not start audio until someone interacts with the page, and a TV
 * is the one screen nobody ever touches — so without this every cue is silently
 * dropped and the game just seems to have no sound. Shown until audio is
 * genuinely running, then gone for good.
 */
export function SoundGate({ onEnable, onMute }: { onEnable: () => void; onMute: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: "clamp(16px,3vh,40px)",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px 12px 20px",
        background: alpha(C.panel, 94),
        border: `1px solid ${C.accent}`,
        boxShadow: "0 18px 50px rgba(0,0,0,.6)",
        animation: "riseFade .4s var(--snap) both",
      }}
    >
      <button
        onClick={onEnable}
        className="tap"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          fontFamily: mono,
          fontSize: "clamp(11px,1vw,14px)",
          letterSpacing: ".2em",
          fontWeight: 600,
          color: C.onAccent,
          background: C.accent,
          border: "none",
        }}
      >
        🔊 TURN ON SOUND
      </button>
      <button
        onClick={onMute}
        className="tap"
        style={{
          padding: "10px 14px",
          fontFamily: mono,
          fontSize: "clamp(9px,.85vw,12px)",
          letterSpacing: ".16em",
          color: C.faint,
          background: "transparent",
          border: `1px solid ${C.line}`,
        }}
      >
        PLAY SILENT
      </button>
    </div>
  );
}
