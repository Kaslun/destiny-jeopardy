import { themeById, themeCss, type Theme } from "../lib/themes";

/**
 * Mounts a theme's palette as CSS custom properties. Used once, in the root
 * layout, so the very first paint is styled; each surface then swaps in its
 * board's theme through `useTheme`.
 */
export function ThemeStyle({ theme, id }: { theme?: Theme; id?: string }) {
  const resolved = theme ?? themeById(id);
  return <style data-theme={resolved.id} dangerouslySetInnerHTML={{ __html: themeCss(resolved) }} />;
}
