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
      // The unit, server, and streams suites all reach for the
      // `react-server.test` Vitest environment and call into modules that
      // require the react-server resolve condition. Running them under
      // `test:client` (which doesn't set NODE_OPTIONS='--conditions
      // react-server') yields "No stashed userOptions found for environment:
      // react-server.test" — they belong to `test:server` / `test:both`.
      ...(getCondition() !== "react-server"
        ? [
            "test/unit/**/*.test.*",
            "test/server/**/*.test.*",
            "test/streams/**/*.test.*",
          ]
        : []),
    ],
  },
});

