"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { alpha, C, mono } from "../lib/theme";

/**
 * Room code plus a QR pointing at this room's player page.
 *
 * The URL is built from the browser's own origin, so it is correct on
 * localhost, on a LAN address and in production without anything to configure —
 * and a phone scanning it lands straight in the right room.
 */
export function JoinPanel({
  room,
  size = 200,
  compact = false,
}: {
  room: string;
  size?: number;
  compact?: boolean;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(`${window.location.origin}/play/${room}`);
  }, [room]);

  const pretty = url.replace(/^https?:\/\//, "");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: compact ? "row" : "column",
        alignItems: "center",
        gap: compact ? 16 : 22,
      }}
    >
      <div
        style={{
          padding: compact ? 8 : 14,
          // White regardless of theme: this is the code's quiet zone, and the
          // camera needs it as much as it needs the code itself.
          background: "#ffffff",
          lineHeight: 0,
          // A quiet zone in the light surround is what makes a code scan from a
          // sofa rather than from arm's length.
          boxShadow: "0 12px 40px rgba(0,0,0,.5)",
        }}
      >
        {url ? (
          // Deliberately not themed. A QR code is read by a camera across a
          // room, and maximum contrast is what makes that reliable — a theme
          // that tints it can only make it harder to scan.
          <QRCodeSVG value={url} size={size} level="M" bgColor="#ffffff" fgColor="#000000" />
        ) : (
          <div style={{ width: size, height: size }} />
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: compact ? "flex-start" : "center",
          gap: compact ? 4 : 10,
        }}
      >
        <div style={{ fontFamily: mono, fontSize: compact ? 9 : 12, letterSpacing: ".3em", color: C.dim }}>
          ROOM CODE
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: compact ? 26 : "clamp(52px,7vw,132px)",
            fontWeight: 600,
            letterSpacing: ".14em",
            lineHeight: 1,
            color: C.accent,
            textShadow: compact ? "none" : `0 0 60px ${alpha(C.accent, 35)}`,
          }}
        >
          {room}
        </div>
        {!compact && (
          <div style={{ fontFamily: mono, fontSize: "clamp(11px,1vw,16px)", letterSpacing: ".18em", color: C.faint }}>
            {pretty || " "}
          </div>
        )}
      </div>
    </div>
  );
}
