import { build } from "vite";
import { resolve } from "node:path";
import { writeFile, mkdir, copyFile } from "node:fs/promises";
const api = process.env.DRAFTPILOT_API_URL || "http://localhost:3001";
const parsed = new URL(api);
if (
  parsed.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(parsed.hostname)
)
  throw new Error("Extension API must use HTTPS.");
const resolveShared = {
  alias: { "@draftpilot/shared/privacy": resolve("../shared/src/privacy.ts") },
};
const definitions = { __API_URL__: JSON.stringify(parsed.origin) };
await build({
  configFile: false,
  resolve: resolveShared,
  define: definitions,
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        sidepanel: resolve("sidepanel.html"),
        background: resolve("src/background.ts"),
      },
      output: { entryFileNames: "[name].js" },
    },
  },
});
await build({
  configFile: false,
  resolve: resolveShared,
  define: definitions,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve("src/content.ts"),
      name: "DraftPilotContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
await writeFile(
  "dist/manifest.json",
  JSON.stringify(
    {
      manifest_version: 3,
      name: "DraftPilot — Customer Support Copilot",
      version: "1.3.0",
      description:
        "Capture customer messages and insert reviewed replies across Gmail, Outlook, Zendesk and regular web pages. Never sends automatically.",
      permissions: [
        "sidePanel",
        "storage",
        "activeTab",
        "scripting",
        "contextMenus",
      ],
      host_permissions: [
        "https://mail.google.com/*",
        "https://outlook.office.com/*",
        "https://outlook.office365.com/*",
        "https://outlook.live.com/*",
        parsed.origin + "/*",
      ],
      background: { service_worker: "background.js", type: "module" },
      action: { default_title: "Open DraftPilot" },
      side_panel: { default_path: "sidepanel.html" },
      content_scripts: [
        {
          matches: [
            "https://mail.google.com/*",
            "https://outlook.office.com/mail/*",
            "https://outlook.office365.com/mail/*",
            "https://outlook.live.com/mail/*",
          ],
          js: ["content.js"],
          run_at: "document_idle",
        },
      ],
      content_security_policy: {
        extension_pages:
          "script-src 'self'; object-src 'none'; base-uri 'none'",
      },
    },
    null,
    2,
  ),
);
