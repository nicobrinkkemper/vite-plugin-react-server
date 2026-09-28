import { describe, it, expect, beforeAll } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSharedBuild, type SharedBuildResult } from "./shared-build.js";
import { setupIndexHTML } from "../setup.js";
import { collectStaticBuiltinImports } from "./edge-bundle-guard.js";
import { getCondition } from "../../dist/plugin/config/getCondition.js";

/**
 * transport: "webpack" — the SSG freeze renders client trees through the
 * baked consumer (react-dom/static.edge). A client component whose hook
 * arrives through a CommonJS package that `require("react")`s — the shape
 * of use-sync-external-store/shim, which react-i18next, zustand and
 * react-redux all route through — must render on the SAME React the
 * consumer activates the dispatcher on. A second physical copy leaves that
 * copy's dispatcher null and the freeze panics with
 * `Cannot read properties of null (reading 'useSyncExternalStore')`.
 *
 * The local package below recreates the installed-dependency shape without
 * pulling the real shim into devDependencies: CJS, `main`, no `exports`,
 * `require("react")` at the top, the hook called through that binding.
 */
const STORE_VALUE = "store-value-7";
const TEST_NAME = "webpack-cjs-store-freeze";

async function setupProject(testDir: string) {
  await setupIndexHTML(testDir);
  await mkdir(resolve(testDir, "src/page"), { recursive: true });
  await mkdir(resolve(testDir, "src/components"), { recursive: true });

  const pkg = resolve(testDir, "node_modules", "fake-store");
  await mkdir(pkg, { recursive: true });
  await writeFile(
    resolve(pkg, "package.json"),
    JSON.stringify({
      name: "fake-store",
      version: "1.0.0",
      main: "index.js",
      peerDependencies: { react: "*" },
    }),
  );
  await writeFile(
    resolve(pkg, "index.js"),
    `"use strict";
var React = require("react");
var value = ${JSON.stringify(STORE_VALUE)};
function subscribe() { return function () {}; }
function getSnapshot() { return value; }
exports.useStoreValue = function useStoreValue() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
`,
  );

  await writeFile(
    resolve(testDir, "src/components/StoreView.client.tsx"),
    `"use client";
import React from "react";
import { useStoreValue } from "fake-store";

export function StoreView() {
  const value = useStoreValue();
  return <output data-testid="store">{value}</output>;
}
`,
  );

  await writeFile(
    resolve(testDir, "src/page/page.tsx"),
    `import React from "react";
import { StoreView } from "../components/StoreView.client.js";

export function Page() {
  return (
    <main>
      <h1>CJS store through the baked consumer</h1>
      <StoreView />
    </main>
  );
}
`,
  );
  await writeFile(
    resolve(testDir, "src/page/props.ts"),
    `export const props = (url: string) => ({ url });`,
  );
}

describe("webpack freeze: client hook from a CJS package that requires react", () => {
  let buildResult: SharedBuildResult;

  beforeAll(async () => {
    buildResult = await getSharedBuild(TEST_NAME, TEST_NAME, {
      setupProject,
      pages: ["/"],
      transport: "webpack",
      // A route error IS the bug: fail the build instead of writing a shell.
      panicThreshold: "all_errors",
      verbose: false,
      clientPackages: ["fake-store"],
    });
  }, 180_000);

  it("freezes without a route error", () => {
    const routeErrors = buildResult.events.filter(
      (e: any) => e.type === "route.error",
    );
    expect(routeErrors).toHaveLength(0);
  });

  it("bakes no node builtin into the consumer for the CJS require", async () => {
    // The runtime-require shape drags `createRequire` from node:module into
    // the client chunk, and from there into the baked pair — the same import
    // a fetch runtime with no node:* rejects at load.
    expect(
      await collectStaticBuiltinImports(
        // shared-build's per-condition outDir: dist-<name>-<condition>.
        resolve(
          buildResult.testDir,
          `dist${getCondition(`-${TEST_NAME}-`)}`,
          "server-edge",
        ),
      ),
    ).toEqual([]);
  });

  it("renders the hook's value into the frozen HTML", () => {
    const html = buildResult
      .htmlFiles()
      .map(([, c]) => c)
      .join("\n");
    expect(html).toContain("CJS store through the baked consumer");
    expect(html).toContain(STORE_VALUE);
  });
});
