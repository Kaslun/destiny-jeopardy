"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { C, newRoomCode } from "../lib/theme";
import { useTheme } from "../lib/useTheme";
import { DEFAULT_THEME_ID } from "../lib/themes";
import { myBoards, type BoardRef } from "../lib/boards";
import { Icon } from "../components/ui";

export default function Landing() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [boards, setBoards] = useState<BoardRef[]>([]);
  // The front door belongs to no particular board, so it wears the default.
  const theme = useTheme(DEFAULT_THEME_ID);

  useEffect(() => setBoards(myBoards()), []);

  const room = code.trim().toUpperCase();
  const ready = room.length >= 3;
  const go = (path: "play" | "tv") => ready && router.push(`/${path}/${room}`);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "clamp(40px,10vh,96px) 16px 48px",
        gap: 40,
        background: "var(--scene-landing)",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
        <h1 className="display" style={{ margin: 0, fontSize: "clamp(44px,9vw,76px)" }}>
          {theme.copy.appName}
        </h1>
        <p style={{ margin: 0, color: C.dim, fontSize: 16 }}>{theme.copy.tagline}</p>
      </header>

      <div style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 14 }}>
        <form
          className="card"
          style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            go("play");
          }}
        >
          <label htmlFor="room" style={{ fontSize: 14, fontWeight: 600, color: C.dim }}>
            Join a game
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="room"
              className="input input-lg mono"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="Room code"
              maxLength={6}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: ".18em", textAlign: "center" }}
            />
            <button type="submit" className="btn btn-primary btn-lg" disabled={!ready} aria-label="Join">
              Join <Icon name="arrowRight" />
            </button>
          </div>
          {ready && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => go("tv")} style={{ alignSelf: "center" }}>
              <Icon name="tv" size={16} /> Open as the TV screen instead
            </button>
          )}
        </form>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Tile icon="play" title="Host a game" onClick={() => router.push(`/host/${newRoomCode()}`)} />
          <Tile icon="edit" title="Create a quiz" onClick={() => router.push("/edit")} />
        </div>
      </div>

      {boards.length > 0 && (
        <section style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="eyebrow">Your quizzes</div>
          <div className="card" style={{ overflow: "hidden" }}>
            {boards.slice(0, 8).map((b, i) => (
              <div
                key={b.slug}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 10px 10px 16px",
                  borderTop: i ? `1px solid ${C.lineSoft}` : "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate" style={{ fontWeight: 600 }}>
                    {b.title || "Untitled quiz"}
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: C.muted }}>
                    {b.slug}
                  </div>
                </div>
                <a className="btn btn-ghost btn-sm" href={`/edit/${b.slug}`}>
                  Edit
                </a>
                <button className="btn btn-sm" onClick={() => router.push(`/host/${newRoomCode()}?board=${b.slug}`)}>
                  <Icon name="play" size={12} /> Host
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Tile({ icon, title, onClick }: { icon: "play" | "edit"; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="card lift tap"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "16px",
        textAlign: "left",
        fontSize: 15,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          flex: "none",
          display: "grid",
          placeItems: "center",
          borderRadius: "var(--r-md)",
          background: `color-mix(in srgb, ${C.accent} 16%, transparent)`,
          color: C.accent,
        }}
      >
        <Icon name={icon} size={icon === "play" ? 14 : 18} />
      </span>
      {title}
    </button>
  );
}
