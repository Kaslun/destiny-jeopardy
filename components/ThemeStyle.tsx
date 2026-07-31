import { themeById, themeCss, type Theme } from "../lib/themes";

/**
 * Mounts a theme's palette as CSS custom properties.
 *
 * Rendered inside each surface rather than once at the root, because the theme
 * is a property of the board and the board arrives over a WebSocket after the
 * page has already painted. The root layout emits a base set so the first frame
 * is never unstyled; this block comes later in the document and therefore wins.
 *
 * It is a `<style>` tag rather than inline styles on a wrapper so that
 * `position: fixed` overlays and portals — anything that escapes the wrapper —
 * still resolve the same variables.
 */
export function ThemeStyle({ theme, id }: { theme?: Theme; id?: string }) {
  const resolved = theme ?? themeById(id);
  return <style data-theme={resolved.id} dangerouslySetInnerHTML={{ __html: themeCss(resolved) }} />;
}
