// Publishes the design doc into `public/design/` so the deployed app can serve
// the board editor at /design/ alongside the live game.
//
// `design/Guardian Jeopardy.dc.html` keeps that exact filename because it is
// what the Claude Design project syncs against, so we copy rather than rename.

import { mkdir, copyFile, rm } from "node:fs/promises";

const OUT = "public/design";

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const files = [
  ["design/Guardian Jeopardy.dc.html", "index.html"],
  ["design/support.js", "support.js"],
];

for (const [from, to] of files) {
  await copyFile(from, `${OUT}/${to}`);
  console.log(`  ${from} -> ${OUT}/${to}`);
}

console.log(`published ${files.length} files into ${OUT}/`);
