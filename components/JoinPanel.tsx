"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { C, mono } from "../lib/theme";

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
          background: "#e8ecf4",
          lineHeight: 0,
          // A quiet zone in the light surround is what makes a code scan from a
          // sofa rather than from arm's length.
          boxShadow: "0 12px 40px rgba(0,0,0,.5)",
        }}
      >
        {url ? (
          <QRCodeSVG value={url} size={size} level="M" bgColor="#e8ecf4" fgColor="#05070c" />
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
            color: C.gold,
            textShadow: compact ? "none" : "0 0 60px rgba(240,196,105,.35)",
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
