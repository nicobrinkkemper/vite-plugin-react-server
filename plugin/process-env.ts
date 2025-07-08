import { DEFAULT_CONFIG } from "./config/defaults.js";
import { getEnvKey } from "./env/getEnvKey.js";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Base environment variables (these use the configured prefix)
      [key: string]: string | undefined;
    }
  }
}

/**
 * Creates a type-safe environment variable accessor for a specific prefix
 * @param prefix The environment prefix (e.g., "VITE_", "CUSTOM_")
 * @returns Object with typed environment variable accessors
 */
export function createEnvAccessor(prefix: string = DEFAULT_CONFIG.ENV_PREFIX) {
  return {
    MODE: process.env[getEnvKey("MODE", prefix)],
    DEV: process.env[getEnvKey("DEV", prefix)],
    PROD: process.env[getEnvKey("PROD", prefix)],
    SSR: process.env[getEnvKey("SSR", prefix)],
    BASE_URL: process.env[getEnvKey("BASE_URL", prefix)],
    PUBLIC_ORIGIN: process.env[getEnvKey("PUBLIC_ORIGIN", prefix)]
  };
}

/**
 * Type definition for environment variables with a specific prefix
 */
export type PrefixedEnv = ReturnType<typeof createEnvAccessor>;

export {};
