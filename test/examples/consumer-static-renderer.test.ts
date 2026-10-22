import { it, expect } from "vitest";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

it("prerenders hooks with the consumer's React when the plugin is linked", () => {
  const root = mkdtempSync(join(tmpdir(), "vprs-consumer-react-"));
  const require = createRequire(import.meta.url);
  try {
    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(root, "package.json"), '{"type":"module"}');
    // Copies, deliberately not symlinks: a plugin-relative renderer would
    // otherwise accidentally share the consumer's React dispatcher.
    for (const pkg of ["react", "react-dom"]) {
      cpSync(dirname(require.resolve(`${pkg}/package.json`)), join(root, "node_modules", pkg), { recursive: true });
    }
    const handler = pathToFileURL(resolve("dist/plugin/stream/createRenderToPipeableStreamHandler.client.js")).href;
    writeFileSync(join(root, "probe.mjs"), `
      import React from "react";
      import { createRenderToPipeableStreamHandler } from ${JSON.stringify(handler)};
      function Consumer() {
        const [value] = React.useState("consumer-hook-ok");
        return React.createElement("p", null, value);
      }
      const { htmlStream } = createRenderToPipeableStreamHandler({
        children: React.createElement(Consumer), prerender: true,
        route: "/", htmlTimeout: 5000,
      });
      let html = "";
      for await (const chunk of htmlStream) html += chunk;
      if (!html.includes("consumer-hook-ok")) throw new Error(html);
      console.log("consumer-hook-ok");
    `);
    const result = spawnSync(process.execPath, [join(root, "probe.mjs")], {
      cwd: root,
      env: { ...process.env, NODE_OPTIONS: "", NODE_ENV: "production", npm_config_local_prefix: root },
      encoding: "utf8", timeout: 15000,
    });
    expect(result.status, result.stderr || String(result.error ?? "")).toBe(0);
    expect(result.stdout).toContain("consumer-hook-ok");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
