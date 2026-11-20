import type { Metadata, Viewport } from "next";
import { ThemeStyle } from "../components/ThemeStyle";
import { DEFAULT_THEME_ID, themeById } from "../lib/themes";
import "./globals.css";

const base = themeById(DEFAULT_THEME_ID);

export const metadata: Metadata = {
  title: base.copy.appName,
  description: "A buzzer quiz for a room full of people and their phones.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: base.colors.bg,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* The UI face, the code face and the default display face. Any other
            display face a board picks is requested on demand by `useTheme`. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&family=Oswald:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        <ThemeStyle theme={base} />
      </head>
      <body>{children}</body>
    </html>
  );
}
