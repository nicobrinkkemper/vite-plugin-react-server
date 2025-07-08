import { DEFAULT_CONFIG } from "../config/defaults.js";

/**
 * Standard environment variable keys that should be prefixed
 */
export const ENV_KEYS = {
  MODE: "MODE",
  DEV: "DEV", 
  PROD: "PROD",
  SSR: "SSR",
  BASE_URL: "BASE_URL",
  PUBLIC_ORIGIN: "PUBLIC_ORIGIN"
} as const;

export type EnvKey = keyof typeof ENV_KEYS;

/**
 * Gets the full environment variable name with the configured prefix
 * @param key The environment variable key (e.g., "MODE", "DEV", "BASE_URL")
 * @param prefix The environment prefix (defaults to user config or "VITE_")
 * @returns The full environment variable name (e.g., "VITE_MODE", "CUSTOM_PREFIX_DEV")
 */
export function getEnvKey(key: EnvKey, prefix?: string): string {
  return `${prefix ?? DEFAULT_CONFIG.ENV_PREFIX}${ENV_KEYS[key]}`;
}

/**
 * Gets the environment variable value with the configured prefix
 * @param key The environment variable key
 * @param prefix The environment prefix (optional)
 * @returns The environment variable value or undefined
 */
export function getEnvValue(key: EnvKey, prefix: string = DEFAULT_CONFIG.ENV_PREFIX): string | undefined {
  return process.env[getEnvKey(key, prefix)];
}

/**
 * Sets an environment variable with the configured prefix
 * @param key The environment variable key
 * @param value The value to set
 * @param prefix The environment prefix (optional)
 */
export function setEnvValue(key: EnvKey, value: string, prefix: string = DEFAULT_CONFIG.ENV_PREFIX): void {
  process.env[getEnvKey(key, prefix)] = value;
}

/**
 * Creates an object with all standard environment variable keys for the given prefix
 * @param prefix The environment prefix
 * @returns Object with all environment variable names
 */
export function getEnvKeys(prefix: string = DEFAULT_CONFIG.ENV_PREFIX): Record<EnvKey, string> {
  return {
    MODE: getEnvKey("MODE", prefix),
    DEV: getEnvKey("DEV", prefix),
    PROD: getEnvKey("PROD", prefix),
    SSR: getEnvKey("SSR", prefix),
    BASE_URL: getEnvKey("BASE_URL", prefix),  
    PUBLIC_ORIGIN: getEnvKey("PUBLIC_ORIGIN", prefix)
  };
} 