import { loadEnv } from "vite";
import { DEFAULT_CONFIG } from "./defaults.js";

export function resolveEnv(
  mode: string,
  envDir: string,
  prefixes: string | string[] = DEFAULT_CONFIG.ENV_PREFIX
) {
  const env = loadEnv(mode, envDir, prefixes);
  for (const key in env) {
    if (key in process.env) {
      continue;
    }
    process.env[key] = env[key];
  }
  return env
}

export const getMetaEnv = (
  env = process.env,
  prefixes: string | string[] = DEFAULT_CONFIG.ENV_PREFIX
) =>
  Object.fromEntries(
    Object.entries(env)
      .map(([key, value]) => {
        const prefix = Array.isArray(prefixes)
          ? prefixes.find((prefix) => key.startsWith(prefix))
          : key.startsWith(prefixes)
          ? prefixes
          : undefined;
        if (typeof prefix !== "string" || prefix === "") {
          return undefined;
        }
        return [key.slice(prefix.length), value];
      })
      .filter(Array.isArray)
  );
