import type { Metadata, Viewport } from "next";
import { ThemeStyle } from "../components/ThemeStyle";
import { DEFAULT_THEME_ID, themeById } from "../lib/themes";
import "./globals.css";

const base = themeById(DEFAULT_THEME_ID);

export const metadata: Metadata = {
  title: base.copy.appName,
  description: "A buzzer trivia game for a room full of people and their phones.",
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
        {/* Every shipped theme's typefaces in one request. There are few enough
            that fetching them all beats a flash of fallback type when a board
            turns out to use a theme whose face was not loaded up front. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Oswald:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* The base palette, so the first paint is never unstyled. Each surface
            re-emits its board's theme further down the document, which wins. */}
        <ThemeStyle theme={base} />
      </head>
      <body>{children}</body>
    </html>
  );
}
