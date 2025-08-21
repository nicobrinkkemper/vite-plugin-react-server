import type { ConfigEnv } from "vite";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { getArgValue } from "./getArgValue.js";
import { getCondition } from "../config/getCondition.js";

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
  } else {
    command = "serve";
  }

  // Detect mode from argv or environment
  const modeArg = getArgValue("mode");
  if (modeArg) {
    mode = modeArg;
  }

  // Detect SSR build
  const ssrArg = getArgValue("ssr");
  let isSsrBuild = ssrArg === "true" || ssrArg === "1";

  // In --app mode, check the current environment to determine if it's SSR
  const appArg = getArgValue("app");
  const isAppMode = appArg === "true" || appArg === "1" || argv.includes("--app");
  
  if (isAppMode) {
    // Check if we're in an SSR environment by looking at the current environment
    const currentEnvironment = getCondition('')
    if (currentEnvironment === "server") {
      isSsrBuild = true;
    } else if (currentEnvironment === "client") {
      isSsrBuild = false;
    }
  }

  return {
    command,
    mode,
    isSsrBuild,
    isAppMode,
  };
};
