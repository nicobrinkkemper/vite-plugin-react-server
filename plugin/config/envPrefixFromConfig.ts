import type { ResolvedConfig } from "vite";
import { DEFAULT_CONFIG } from "./defaults.js";

export function envPrefixFromConfig(config: Pick<ResolvedConfig, "envPrefix">) {
  return typeof config.envPrefix === "string"
    ? config.envPrefix
    : Array.isArray(config.envPrefix)
    ? config.envPrefix[0]
    : DEFAULT_CONFIG.ENV_PREFIX;
}