"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { alpha, C } from "../lib/theme";

/**
 * Room code plus a QR pointing at this room's player page. The URL is built
 * from the browser's own origin, so it is right on localhost, a LAN address
 * and production alike.
 */
export function JoinPanel({ room, size = 200, compact = false }: { room: string; size?: number; compact?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${window.location.origin}/play/${room}`), [room]);
  const host = url.replace(/^https?:\/\//, "").replace(/\/play\/.*$/, "");

  return (
    <div style={{ display: "flex", flexDirection: compact ? "row" : "column", alignItems: "center", gap: compact ? 18 : 28 }}>
      <div
        style={{
          padding: compact ? 10 : 16,
          // White regardless of theme: the quiet zone matters as much as the code.
          background: "#ffffff",
          borderRadius: "var(--r-lg)",
          lineHeight: 0,
        }}
      >
        {url ? (
          <QRCodeSVG value={url} size={size} level="M" bgColor="#ffffff" fgColor="#000000" />
        ) : (
          <div style={{ width: size, height: size }} />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: compact ? "flex-start" : "center", gap: compact ? 2 : 8 }}>
        <div style={{ fontSize: compact ? 13 : "clamp(14px,1.3vw,22px)", color: C.dim }}>
          {compact ? "Room code" : <>Go to <b style={{ color: C.text }}>{host || "…"}</b> and enter</>}
        </div>
        <div
          className="mono"
          style={{
            fontSize: compact ? 34 : "clamp(64px,8vw,150px)",
            fontWeight: 600,
            letterSpacing: ".12em",
            lineHeight: 1,
            color: C.accent,
            textShadow: compact ? "none" : `0 0 60px ${alpha(C.accent, 35)}`,
          }}
        >
          {room}
        </div>
      </div>
    </div>
  );
}
