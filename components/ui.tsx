"use client";

/**
 * The shared UI kit. Styling lives in `app/globals.css` as a small set of
 * classes (`btn`, `input`, `seg`, `card`…); these components are thin wrappers
 * for the pieces that need behaviour — toasts, menus, drawers, confirmations.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { C } from "../lib/theme";

/* ------------------------------------------------------------------ */
/* Icons — 24px grid, 2px stroke, drawn for this app.                   */
/* ------------------------------------------------------------------ */

const PATHS = {
  play: "M7 4.5v15l12-7.5z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  copy: "M9 9h10v10H9zM5 15V5h10",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  share: "M12 3v12M7 8l5-5 5 5M5 13v6h14v-6",
  palette:
    "M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3zM7.5 12.5h.01M9.5 8h.01M14.5 8h.01",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  chevronDown: "M6 9l6 6 6-6",
  arrowLeft: "M19 12H5M11 18l-6-6 6-6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  tv: "M3 5h18v12H3zM8 21h8",
  users: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  image: "M4 4h16v16H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01",
  video: "M3 6h12v12H3zM15 10l6-3.5v11L15 14",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  youtube: "M3 8.5C3 6.6 4.6 5 6.5 5h11C19.4 5 21 6.6 21 8.5v7c0 1.9-1.6 3.5-3.5 3.5h-11A3.5 3.5 0 0 1 3 15.5zM10 9v6l5-3z",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2.5M9 2h6",
  home: "M4 11l8-7 8 7v9H4zM9.5 20v-6h5v6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  volume: "M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  volumeOff: "M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.9 0 3.5-.6 4.9-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2",
  crown: "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z",
  refresh: "M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4",
  logout: "M15 4h4v16h-4M10 17l5-5-5-5M15 12H3",
  zap: "M13 2L4 14h7l-1 8 9-12h-7z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  hand: "M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L2.5 15.5a1.5 1.5 0 0 1 2.3-1.9L8 16",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  wifiOff: "M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.2-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.7 5M12 20h.01",
  trophy: "M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  stroke = 2,
  fill = false,
  style,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  fill?: boolean;
  style?: React.CSSProperties;
}) {
  const solid = fill || name === "play";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={style}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Brand mark                                                           */
/* ------------------------------------------------------------------ */

/** The logo slot: the board's chosen mark, or nothing at all. */
export function Mark({ mark, size = 40 }: { mark?: string; size?: number }) {
  if (!mark) return null;
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        flex: "none",
        display: "grid",
        placeItems: "center",
        fontSize: size * 0.62,
        lineHeight: 1,
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        color: C.accent,
      }}
    >
      {mark}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                               */
/* ------------------------------------------------------------------ */

export type Tone = "ok" | "error" | "info";

/** One toast at a time, replaced by the next. Returns the node and a trigger. */
export function useToast(): [React.ReactNode, (text: string, tone?: Tone) => void] {
  const [toast, setToast] = useState<{ text: string; tone: Tone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: Tone = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), tone === "error" ? 5200 : 2800);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const node = toast ? (
    <div key={toast.id} className="toast float" role="status">
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          flex: "none",
          color: C.onAccent,
          background: toast.tone === "error" ? C.warn : toast.tone === "info" ? C.info : C.good,
        }}
      >
        <Icon name={toast.tone === "error" ? "x" : toast.tone === "info" ? "sparkle" : "check"} size={12} stroke={3} />
      </span>
      <span style={{ minWidth: 0 }}>{toast.text}</span>
    </div>
  ) : null;

  return [node, show];
}

/** Copy text, falling back to showing it when the clipboard is unavailable. */
export async function copyText(text: string, toast: (t: string, tone?: Tone) => void, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    toast(text, "info");
  }
}

/* ------------------------------------------------------------------ */
/* Confirm-by-tapping-twice                                             */
/* ------------------------------------------------------------------ */

/**
 * A destructive button that needs a second press. The first press arms it and
 * relabels it; moving focus away or waiting disarms it.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Tap again to confirm",
  className = "btn",
  style,
  title,
  disabled,
}: {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      className={`${className} ${armed ? "armed" : ""}`}
      style={style}
      title={title}
      disabled={disabled}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Form bits                                                            */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  children,
  aside,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <label className="field" style={{ minWidth: 0 }}>
      <span className="label">
        <span style={{ flex: 1 }}>{label}</span>
        {aside}
      </span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

/** A labelled row with a switch on the right. */
export function SwitchRow({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon?: IconName;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 40 }}>
      {icon && (
        <span style={{ color: checked ? C.accent : C.muted, display: "grid" }}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  style,
}: {
  value: T;
  options: readonly { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div className="seg" role="group" style={style}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Menus and drawers                                                    */
/* ------------------------------------------------------------------ */

/** Closes on outside click and Escape. */
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

/** A button that opens a floating panel below it. */
export function Popover({
  trigger,
  children,
  align = "right",
  width = 260,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  return (
    <div ref={ref} style={{ position: "relative", flex: "none" }}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className="float anim-pop"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            [align]: 0,
            zIndex: 50,
            width,
            padding: 6,
            transformOrigin: align === "right" ? "top right" : "top left",
          }}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={typeof title === "string" ? title : undefined}>
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 16px 20px", borderBottom: `1px solid ${C.lineSoft}` }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>{title}</div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <div className="scroll" style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 24 }}>
          {children}
        </div>
        {footer && <footer style={{ padding: 16, borderTop: `1px solid ${C.lineSoft}` }}>{footer}</footer>}
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Small displays                                                       */
/* ------------------------------------------------------------------ */

/** Connection status as a dot, with words only when something is wrong. */
export function LiveDot({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="chip" title="Connected" style={{ background: "transparent", paddingLeft: 4, paddingRight: 4 }}>
      <span className="dot" style={{ background: C.good, boxShadow: `0 0 0 3px color-mix(in srgb, ${C.good} 25%, transparent)` }} />
    </span>
  ) : (
    <span className="chip" style={{ color: C.warn, background: `color-mix(in srgb, ${C.warn} 14%, transparent)` }}>
      <Icon name="wifiOff" size={14} /> Reconnecting
    </span>
  );
}

/** Section heading inside a panel. */
export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div className="eyebrow" style={{ flex: 1 }}>
        {children}
      </div>
      {aside}
    </div>
  );
}

/** Full-screen centred message — loading, connecting, errors. */
export function Splash({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "var(--scene-landing)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
        <div className="spinner" />
        <div style={{ fontSize: 16, fontWeight: 600, color: C.dim }}>{children}</div>
        {sub}
      </div>
    </main>
  );
}
