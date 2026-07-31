"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { C, mono, newRoomCode, SCENE } from "../lib/theme";
import { useTheme } from "../lib/useTheme";
import { DEFAULT_THEME_ID } from "../lib/themes";

export default function Landing() {
  const router = useRouter();
  const [code, setCode] = useState("");
  // The front door belongs to no particular board, so it wears the default.
  const theme = useTheme(DEFAULT_THEME_ID);

  const join = (path: "play" | "tv") => {
    const room = code.trim().toUpperCase();
    if (room.length >= 3) router.push(`/${path}/${room}`);
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 44,
        padding: "48px 24px",
        background: SCENE.landing,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 12, height: 46, background: C.accent, transform: "skewX(-14deg)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: ".3em", color: C.dim }}>
            {theme.copy.tagline}
          </div>
          <h1 style={{ margin: 0, fontSize: 38, fontWeight: 700, letterSpacing: ".04em" }}>
            {theme.copy.appName}
          </h1>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 380 }}>
        <button
          onClick={() => router.push(`/host/${newRoomCode()}`)}
          style={{
            padding: "20px",
            fontFamily: mono,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: ".2em",
            color: C.onAccent,
            background: C.accent,
            border: "none",
          }}
        >
          ◆ HOST A NEW GAME
        </button>

        <div
          style={{
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: ".24em",
            color: C.faint,
            textAlign: "center",
            padding: "10px 0 2px",
          }}
        >
          OR ENTER A ROOM CODE
        </div>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && join("play")}
          placeholder={theme.copy.codeExample}
          maxLength={6}
          style={{
            padding: "18px",
            fontFamily: mono,
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: ".22em",
            textAlign: "center",
            color: C.accent,
          }}
        />

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => join("play")}
            disabled={code.trim().length < 3}
            style={{
              flex: 2,
              padding: "16px",
              fontFamily: mono,
              fontSize: 12,
              letterSpacing: ".18em",
              fontWeight: 600,
              color: C.onAccent,
              background: C.info,
              border: "none",
            }}
          >
            JOIN AS PLAYER
          </button>
          <button
            onClick={() => join("tv")}
            disabled={code.trim().length < 3}
            style={{
              flex: 1,
              padding: "16px",
              fontFamily: mono,
              fontSize: 12,
              letterSpacing: ".18em",
              background: C.surface,
              border: `1px solid ${C.line}`,
            }}
          >
            OPEN TV
          </button>
        </div>
      </div>

      <div
        style={{
          fontFamily: mono,
          fontSize: 11,
          letterSpacing: ".16em",
          color: C.faint,
          textAlign: "center",
          lineHeight: 2,
        }}
      >
        BUILD A BOARD IN THE <a href="/edit">EDITOR</a>, SAVE IT FOR A CODE,
        <br />
        THEN LOAD THAT CODE FROM THE HOST CONSOLE.
      </div>
    </main>
  );
}
