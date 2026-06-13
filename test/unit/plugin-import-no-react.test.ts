import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard: neither plugin entry may pull React (or
 * react-dom, or the vendored react-server-dom-esm transport) into the module
 * graph at import time. React's CJS variant (dev/prod) locks to whatever loads
 * first; if a static import chain — the default Html/Root components, or the
 * vendor modules — evaluates React at plugin-import (config eval), a process
 * that later settles NODE_ENV/condition is stuck with the wrong variant (the
 * `lockReactFamily` warning case).
 *
 * This MUST run in a child process: vitest itself runs under react-server with
 * React already loaded, so an in-process cache check would always see React.
 * We import the BUILT entry (pretest:server builds dist), then scan the CJS
 * require cache for a fully evaluated react / react-dom / transport module.
 * Only `module.loaded === true` entries count — Node's ESM->CJS bridge leaves
 * unevaluated (loaded=false) stubs from static analysis.
 */
const probe = (entryAbsPath: string) => `
import { createRequire } from "node:module";
const req = createRequire(${JSON.stringify(entryAbsPath)});
const loaded = () => {
  const cache = req.cache ?? {};
  const hits = [];
  for (const key in cache) {
    if (!cache[key]?.loaded) continue;
    if (/[\\\\/](react|react-dom)[\\\\/]cjs[\\\\/]/.test(key)) hits.push(key);
    else if (/[\\\\/]node_modules[\\\\/](react|react-dom)[\\\\/]index\\.js$/.test(key)) hits.push(key);
    else if (/react-server-dom-esm/.test(key)) hits.push(key);
  }
  return hits;
};
await import(${JSON.stringify(entryAbsPath)});
process.stdout.write(JSON.stringify(loaded()));
`;

function reactModulesLoadedByImporting(
  entryRelPath: string,
  nodeConditions: string[],
): string[] {
  const entry = resolve(process.cwd(), entryRelPath);
  // Built dist is a pretest:server prerequisite; fail loudly if absent so a
  // bare `vitest` run without a build doesn't report a confusing false result.
  if (!existsSync(entry)) {
    throw new Error(
      `${entry} not built — run \`npm run build\` first (pretest:server does this).`,
    );
  }
  const env = { ...process.env };
  delete env.NODE_ENV; // detect a pre-settle React load
  const out = execFileSync(
    process.execPath,
    [
      ...nodeConditions.flatMap((c) => ["--conditions", c]),
      "--input-type=module",
      "-e",
      probe(entry),
    ],
    { env, encoding: "utf8" },
  );
  return JSON.parse(out);
}

describe("plugin entries do not import React at load", () => {
  it("react-server entry loads zero React/react-dom/transport modules", () => {
    expect(
      reactModulesLoadedByImporting("dist/plugin/index.server.js", [
        "react-server",
      ]),
    ).toEqual([]);
  });

  it("client/default entry loads zero React/react-dom/transport modules", () => {
    expect(
      reactModulesLoadedByImporting("dist/plugin/index.client.js", []),
    ).toEqual([]);
  });
});
