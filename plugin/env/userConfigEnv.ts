import { resolveEnv } from "../config/resolveEnv.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { userProjectRoot } from "../root.js";
import { getArgValue } from "./getArgValue.js";


const isBuild = process.argv.includes("build");
const isPreview = process.argv.includes("preview");


// Set up environment variables from .env files as early as possible
// This is to ensure that the env variables are available even in the config file,
// and you can use process.env to configure the plugin.

// Detect mode from command line arguments
const detectedMode = getArgValue("mode")  || process.env["NODE_ENV"] || (isBuild || isPreview ? "production" : "development");

export const userConfigEnv = resolveEnv(
  detectedMode,
  userProjectRoot,  
  DEFAULT_CONFIG.ENV_PREFIX
);