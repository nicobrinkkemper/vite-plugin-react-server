import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for bd 0uy: the plugin's react-server entry must not pull
 * React into the module graph at import time. React's CJS variant (dev/prod)
 * locks to whatever loads first; if a static `import` chain rooted in the
 * plugin's default Html/Root components evaluates React at plugin-import
 * (config eval), a process that later settles NODE_ENV/condition is stuck with
 * the wrong variant — the `lockReactFamily` warning case.
 *
 * This MUST run in a child process: vitest itself runs under react-server with
 * React already loaded, so an in-process cache check would always see React.
 * We import the BUILT entry (pretest:server builds dist) under the react-server
 * condition with NODE_ENV unset, then scan the CJS require cache for a fully
 * evaluated react variant. Only `module.loaded === true` entries count — Node's
 * ESM->CJS bridge leaves unevaluated (loaded=false) stubs from static analysis.
 */
const SERVER_ENTRY = resolve(process.cwd(), "dist/plugin/index.server.js");

const PROBE = `
import { createRequire } from "node:module";
const req = createRequire(${JSON.stringify(SERVER_ENTRY)});
const loaded = () => {
  const cache = req.cache ?? {};
  const hits = [];
  for (const key in cache) {
    if (!cache[key]?.loaded) continue;
    if (/[\\\\/]react[\\\\/]cjs[\\\\/]react\\.[^\\\\/]*\\.js$/.test(key)) hits.push(key);
    else if (/[\\\\/]node_modules[\\\\/]react[\\\\/]index\\.js$/.test(key)) hits.push(key);
  }
  return hits;
};
await import(${JSON.stringify(SERVER_ENTRY)});
process.stdout.write(JSON.stringify(loaded()));
`;

describe("plugin react-server entry does not import React at load (bd 0uy)", () => {
  it("loads zero React modules when the server entry is imported", () => {
    // Built dist is a pretest:server prerequisite; skip loudly if absent so a
    // bare `vitest` run without a build doesn't report a false failure.
    if (!existsSync(SERVER_ENTRY)) {
      throw new Error(
        `${SERVER_ENTRY} not built — run \`npm run build\` before this test (pretest:server does this).`,
      );
    }
    const env = { ...process.env };
    delete env.NODE_ENV;
    const out = execFileSync(
      process.execPath,
      ["--conditions", "react-server", "--input-type=module", "-e", PROBE],
      { env, encoding: "utf8" },
    );
    expect(JSON.parse(out)).toEqual([]);
  });
});
