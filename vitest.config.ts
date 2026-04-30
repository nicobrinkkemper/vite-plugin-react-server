import { defineConfig } from "vitest/config";
import { getCondition } from "./plugin/config/getCondition.js";

export default defineConfig({
  mode: "development",
  resolve: {
    conditions: getCondition() === "react-server" 
      ? ["react-server", "node", "import"] 
      : ["node", "import"],
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
    hookTimeout: 10000,
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
      ...(getCondition() !== "react-server"
        ? ["test/unit/**/*.test.*", "test/server/**/*.test.*"]
        : []),
    ],
  },
});

