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
    hookTimeout: 10000,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.*"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      // Exclude unit tests and server tests when NOT in react-server condition (i.e., in client mode)
      ...(getCondition() !== "react-server" ? ["test/unit/**/*.test.*", "test/server/**/*.test.*"] : []),
    ],
  },
});

