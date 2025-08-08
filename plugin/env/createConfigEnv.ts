import type { ConfigEnv } from "vite";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { getArgValue } from "./getArgValue.js";

/**
 * Extended ConfigEnv that includes our custom properties
 */
export interface ExtendedConfigEnv extends ConfigEnv {
  isAppMode?: boolean;
}

/**
 * Reconstruct ConfigEnv from process.argv and environment variables
 * This allows us to determine the config environment before the config hook runs
 */
export const createConfigEnv = (
  mode: string = getNodeEnv(),
  command: "build" | "serve" = "serve",
  argv: string[] = process.argv
): ExtendedConfigEnv => {
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

  // Detect app mode (--app flag)
  const appArg = getArgValue("app");
  const isAppMode = appArg === "true" || appArg === "1" || argv.includes("--app");

  return {
    command,
    mode,
    isSsrBuild,
    isAppMode,
  };
};
