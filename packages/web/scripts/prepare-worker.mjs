import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const library = await readFile(
  require.resolve("xlsx/dist/xlsx.full.min.js"),
  "utf8",
);
const worker = await readFile(
  new URL("../workers/import.js", import.meta.url),
  "utf8",
);
await mkdir(new URL("../public/workers", import.meta.url), { recursive: true });
await writeFile(
  new URL("../public/workers/import.js", import.meta.url),
  library + "\n" + worker,
);
