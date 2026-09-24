import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
mkdirSync("../web/public", { recursive: true });
execFileSync("python3", [
  "-c",
  "import shutil;shutil.make_archive('../web/public/draftpilot-extension','zip','dist')",
]);
