import { join } from "node:path";
import { defineConfig } from "vitest/config";
import { getCondition } from "./plugin/config/getCondition.js";
import { transportPkgDir } from "./plugin/vendor/transportDir.js";

export default defineConfig({
  mode: "development",
  resolve: {
    conditions: getCondition() === "react-server"
      ? ["react-server", "node", "import"]
      : ["node", "import"],
    // `react-server-dom-esm` is not a direct dependency — it ships vendored
    // inside `react-server-loader`, and at runtime the plugin resolves it from
    // there. Tests that import it in-process (e.g. createReactFetcher, or the
    // worker's messageHandler) otherwise depend on it being hoisted to
    // top-level node_modules, which is not guaranteed. Point the subpaths they
    // use at the vendored copy, the same place the plugin resolves it. (Only
    // these subpaths are aliased, each pinned to the file its react-server
    // resolution would pick; aliasing the whole package would bypass its
    // conditional exports.)
    alias: {
      "react-server-dom-esm/client.browser": join(transportPkgDir, "client.browser.js"),
      "react-server-dom-esm/server": join(transportPkgDir, "server.node.js"),
    },
  },
  ssr: {
    resolve: {
      conditions: getCondition() === "react-server"
        ? ["react-server", "node", "import"]
        : ["node", "import"],
    },
  },
  test: {
    globals: true,
    // Many tests (test/examples and test/dev) run real Vite builds end-to-end,
    // which routinely take longer than vitest's 5s default — especially on CI
    // where parallel workers all contend for the same fs/cpu. Bumping the
    // default keeps the suite green without per-test timeout overrides on
    // every real-build case.
    testTimeout: 30000,
    // beforeAll hooks run the same real builds the tests do (getSharedBuild
    // in beforeAll is the common pattern) — they need the same ceiling.
    hookTimeout: 30000,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.*"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      // The unit and server suites are gated on the react-server resolve
      // condition (they import from react-server-only paths). Streams stay
      // included in both modes — the worker mechanism handles RSC rendering
      // from a react-client process via spawning a react-server worker.
      // The router client suite (Link / RouterProvider) imports
      // react-dom/client, which throws under the react-server condition, so it
      // runs client-mode only — mirror of the unit exclusion above.
      ...(getCondition() !== "react-server"
        ? ["test/unit/**/*.test.*"]
        : ["test/router/**/*.test.*"]),
    ],
  },
});

