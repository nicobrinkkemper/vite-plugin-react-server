import { defineConfig } from "vitest/config";
import { getCondition } from "vite-plugin-react-server/config";

export default defineConfig({
  mode: "development",
  test: {
    globals: true,
    hookTimeout: 10000,
    environment: "node",
    setupFiles: ["./test/setup.ts"],

    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [""],
      include: ["dist"],
    },
    include: [
      "test/**/*.test.*",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      // these folders require the server condition
      ...(getCondition() !== "react-server"
        ? ["test/unit/**/*.test.*", "test/server/**/*.test.*"]
        : []),
    ],
    typecheck: {
      include: [
        "test/**/*.test.ts",
        "test/**/*.spec.ts",
        "test/**/*.test.tsx",
        "test/**/*.spec.tsx",
      ],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/cypress/**",
        "**/.{idea,git,cache,output,temp}/**",
      ],
    },
  },
});
