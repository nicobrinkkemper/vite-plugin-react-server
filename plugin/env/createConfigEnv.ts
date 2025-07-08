import type { ConfigEnv } from "vite";
import { getNodeEnv } from "../getNodeEnv.js";
import { getArgValue } from "./getArgValue.js";

/**
 * Reconstruct ConfigEnv from process.argv and environment variables
 * This allows us to determine the config environment before the config hook runs
 */
export const createConfigEnv = (
  mode: string = getNodeEnv(),
  command: "build" | "serve" = "serve",
  argv: string[] = process.argv
): ConfigEnv => {
  // Detect command from argv
  if (argv.includes("build")) {
    command = "build";
  } else if (
    argv.includes("dev") ||
    argv.includes("serve") ||
    argv.includes("preview")
  ) {
    command = "serve";
  }

  // Detect mode from argv or environment
  const modeArg = getArgValue("mode");
  if (modeArg) {
    mode = modeArg;
  }

  // Detect SSR build
  const ssrArg = getArgValue("ssr");
  const isSsrBuild = ssrArg === "true" || ssrArg === "1";

  return {
    command,
    mode,
    isSsrBuild,
  };
};
