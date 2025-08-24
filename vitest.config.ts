import { defineConfig } from "vitest/config";
import { getCondition } from "vite-plugin-react-server/config";

export default defineConfig({
  mode: "development",
  test: {
    globals: true,
    hookTimeout: 30000,
    testTimeout: 30000, // Increase test timeout to 30 seconds
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    // Let worker processes inherit Node.js conditions from parent process
    

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
        : ["test/client/**/*.test.*"]),
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
