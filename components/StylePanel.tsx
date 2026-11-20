"use client";

import { useEffect } from "react";
import { C } from "../lib/theme";
import { FONTS, THEMES, type Theme } from "../lib/themes";
import type { BoardStyle } from "../shared/protocol";
import { Drawer, Icon, Mark, Segmented, SwitchRow } from "./ui";

const ACCENTS = ["#ffcc33", "#ff8c5a", "#ff3ea5", "#b07bff", "#3355ff", "#3ee8ff", "#4dd6c1", "#5fdc8f"];
const BACKGROUNDS = ["#04081c", "#05070c", "#0b0615", "#1b0f1c", "#0d1a14", "#1c1c22", "#f4f2ec", "#ffffff"];
const MARKS = ["🎯", "🧠", "🏆", "⚡", "🎉", "🎄", "👻", "🍕"];

/** Load every pickable face once, so the font buttons preview themselves. */
function usePreviewFonts(open: boolean) {
  useEffect(() => {
    if (!open || document.getElementById("font-preview-all")) return;
    const link = document.createElement("link");
    link.id = "font-preview-all";
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${FONTS.map((f) => `family=${f.google}`).join("&")}&display=swap`;
    document.head.appendChild(link);
  }, [open]);
}

/**
 * Make the quiz your own: a preset to start from, then colours, typeface,
 * corners and a logo mark. Every change is live — the editor behind the panel
 * wears the theme, so what you see is what the room will see.
 */
export function StylePanel({
  open,
  onClose,
  theme,
  presetId,
  style,
  onPreset,
  onStyle,
}: {
  open: boolean;
  onClose: () => void;
  theme: Theme;
  presetId: string;
  style: BoardStyle;
  onPreset: (id: string) => void;
  onStyle: (next: BoardStyle | null) => void;
}) {
  usePreviewFonts(open);
  const set = <K extends keyof BoardStyle>(key: K, value: BoardStyle[K] | undefined) => {
    const next = { ...style };
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    onStyle(Object.keys(next).length ? next : null);
  };
  const customised = Object.keys(style).length > 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Style"
      footer={
        <div style={{ display: "flex", gap: 8 }}>
          {customised && (
            <button className="btn btn-ghost" onClick={() => onStyle(null)}>
              <Icon name="refresh" size={16} /> Reset to preset
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <Preview theme={theme} />

      <Group title="Start from">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {THEMES.map((t) => {
            const on = t.presetId === presetId;
            return (
              <button
                key={t.id}
                onClick={() => onPreset(t.id)}
                className="tap"
                aria-pressed={on}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 8,
                  borderRadius: "var(--r-md)",
                  border: `2px solid ${on ? C.accent : C.lineSoft}`,
                  background: C.surfaceDeep,
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    height: 44,
                    borderRadius: 6,
                    background: t.scenes.board,
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 4,
                    padding: 6,
                    border: `1px solid ${t.colors.lineSoft}`,
                  }}
                >
                  <span style={{ width: 14, height: 10, borderRadius: 2, background: t.colors.accent }} />
                  <span style={{ width: 14, height: 10, borderRadius: 2, background: t.colors.surface }} />
                  <span style={{ width: 14, height: 10, borderRadius: 2, background: t.colors.special }} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Accent">
        <Swatches value={theme.colors.accent} options={ACCENTS} onPick={(c) => set("accent", c)} />
      </Group>

      <Group title="Background">
        <Swatches value={theme.colors.bg} options={BACKGROUNDS} onPick={(c) => set("bg", c)} />
      </Group>

      <Group title="Typeface">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
          {FONTS.map((f) => {
            const on = f.id === theme.fontId;
            return (
              <button
                key={f.id}
                onClick={() => set("font", f.id)}
                aria-pressed={on}
                className="tap"
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: "var(--r-md)",
                  border: `2px solid ${on ? C.accent : C.lineSoft}`,
                  background: C.surfaceDeep,
                  textAlign: "left",
                }}
              >
                <span style={{ fontFamily: f.stack, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>Aa</span>
                <span className="truncate" style={{ fontSize: 13, color: C.dim }}>
                  {f.name}
                </span>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Shape">
        <Segmented
          value={theme.corners}
          onChange={(v) => set("corners", v)}
          style={{ width: "100%" }}
          options={[
            { value: "sharp", label: "Sharp" },
            { value: "cut", label: "Cut" },
            { value: "soft", label: "Soft" },
            { value: "round", label: "Round" },
          ]}
        />
        <SwitchRow label="Capital headings" checked={theme.caps} onChange={(v) => set("caps", v)} />
      </Group>

      <Group title="Logo">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => set("mark", undefined)}
            aria-pressed={!theme.mark}
            title="Default"
            style={markBtn(!theme.mark)}
          >
            <Mark size={26} />
          </button>
          {MARKS.map((m) => (
            <button key={m} onClick={() => set("mark", m)} aria-pressed={theme.mark === m} style={markBtn(theme.mark === m)}>
              <span style={{ fontSize: 20 }}>{m}</span>
            </button>
          ))}
          <input
            className="input"
            value={MARKS.includes(theme.mark) ? "" : theme.mark}
            onChange={(e) => set("mark", e.target.value)}
            placeholder="Aa"
            maxLength={3}
            aria-label="Custom logo text"
            style={{ width: 64, height: 40, textAlign: "center", fontWeight: 700 }}
          />
        </div>
      </Group>
    </Drawer>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="eyebrow">{title}</div>
      {children}
    </section>
  );
}

function Swatches({ value, options, onPick }: { value: string; options: string[]; onPick: (c: string) => void }) {
  const custom = !options.includes(value.toLowerCase());
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {options.map((c) => {
        const on = c === value.toLowerCase();
        return (
          <button
            key={c}
            onClick={() => onPick(c)}
            aria-label={c}
            aria-pressed={on}
            className="tap"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: c,
              border: `2px solid ${C.lineSoft}`,
              boxShadow: on ? `0 0 0 2px ${C.panel}, 0 0 0 4px ${C.text}` : "none",
            }}
          />
        );
      })}
      {/* The escape hatch: any colour at all. */}
      <label
        title="Pick any colour"
        style={{
          position: "relative",
          width: 30,
          height: 30,
          borderRadius: "50%",
          cursor: "pointer",
          background: custom ? value : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
          border: `2px solid ${C.lineSoft}`,
          boxShadow: custom ? `0 0 0 2px ${C.panel}, 0 0 0 4px ${C.text}` : "none",
          display: "grid",
          placeItems: "center",
          color: "#fff",
        }}
      >
        {!custom && <Icon name="plus" size={14} stroke={3} />}
        <input
          type="color"
          value={value}
          onChange={(e) => onPick(e.target.value)}
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
        />
      </label>
    </div>
  );
}

function markBtn(on: boolean): React.CSSProperties {
  return {
    width: 40,
    height: 40,
    display: "grid",
    placeItems: "center",
    borderRadius: "var(--r-md)",
    border: `2px solid ${on ? C.accent : C.lineSoft}`,
    background: C.surfaceDeep,
  };
}

/** A tiny board in the current theme, so the panel shows its own result. */
function Preview({ theme }: { theme: Theme }) {
  return (
    <div
      className="shape"
      style={{
        background: "var(--scene-board)",
        border: `1px solid ${C.lineSoft}`,
        borderRadius: "var(--r-lg)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Mark mark={theme.mark} size={26} />
        <div className="display" style={{ fontSize: 18 }}>
          Quiz night
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
        {["Films", "Science", "Food", "Music"].map((c) => (
          <div
            key={c}
            className="display shape"
            style={{
              fontSize: 10,
              textAlign: "center",
              padding: "6px 2px",
              background: C.surface,
              borderTop: `2px solid ${C.accent}`,
              borderRadius: "var(--r-sm)",
            }}
          >
            {c}
          </div>
        ))}
        {[200, 400].flatMap((v) =>
          [0, 1, 2, 3].map((i) => (
            <div
              key={`${v}-${i}`}
              className="display shape"
              style={{
                fontSize: 15,
                textAlign: "center",
                padding: "6px 0",
                color: C.accent,
                background: `linear-gradient(180deg, ${C.surface}, ${C.tile})`,
                border: `1px solid ${C.edgeSoft}`,
                borderRadius: "var(--r-sm)",
                opacity: v === 200 && i === 1 ? 0.25 : 1,
              }}
            >
              {v}
            </div>
          )),
        )}
      </div>
    </div>
  );
}
