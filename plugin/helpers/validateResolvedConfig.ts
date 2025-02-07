import type { ResolvedConfig } from "vite";

export function validateResolvedConfig(config: ResolvedConfig): asserts config is ResolvedConfig {
    if (
      typeof config === "object" &&
      config != null &&
      "build" in config &&
      typeof config.build === "object" &&
      config.build != null &&
      "rollupOptions" in config.build &&
      typeof config.build.rollupOptions === "object" &&
      config.build.rollupOptions != null &&
      "input" in config.build.rollupOptions &&
      typeof config.build.rollupOptions.input === "object" &&
      config.build.rollupOptions.input != null
    ) {
      return undefined; 
    }
    throw new Error("Invalid config");
  };
  