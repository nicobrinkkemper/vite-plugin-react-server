import type { InputOption } from "rollup";
import type { UserConfig } from "vite";
import type { InputNormalizer, InputNormalizerWorker } from "../types.js";

export function validateModuleBase(
  input: InputOption,
  moduleBase: string,
  moduleBaseExceptions: string[]
) {
  for (const [key, value] of Object.entries(input)) {
    const isException = moduleBaseExceptions.includes(key) || ["/index", "index"].includes(key);
    if (!key.includes("/")) return;
    if (value.startsWith("//")) {
      throw new Error(`Path shouldn't start with //`);
    }
    if (!key.startsWith(moduleBase) && !isException) {
      throw new Error(`Invalid input: ${key} does not start with ${moduleBase}`);
    }
    if (!value.startsWith("/" + moduleBase) && !isException) {
      throw new Error(`Invalid value: ${value} does not start with ${moduleBase}`);
    }
  }
}

export function createSharedBuildConfig(config: UserConfig, rollupOptions: any): UserConfig {
  return {
    ...config,
    build: {
      ...config.build,
      rollupOptions: {
        ...config.build?.rollupOptions,
        ...rollupOptions
      }
    }
  };
} 