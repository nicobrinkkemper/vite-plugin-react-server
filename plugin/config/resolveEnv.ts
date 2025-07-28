import { loadEnv, type ResolvedConfig } from "vite";
import { DEFAULT_CONFIG } from "./defaults.js";
import { getCondition } from "./getCondition.js";
import { getNodeEnv } from "./getNodeEnv.js";
import { getEnvKey } from "../env/getEnvKey.js";

type NestedEnv = {
  [key: string]: unknown | NestedEnv;
};

function setNestedEnv(obj: NestedEnv, path: string[], value: string, verbose = false) {
  if (!path.length) return;
  const key = path[0];
  if (verbose) {
    console.log("setNestedEnv:", { key, path, value, currentObj: obj[key] });
  }
  if (path.length === 1) {
    obj[key] = value;
    return;
  }
  if (!obj[key] || typeof obj[key] === "string") {
    obj[key] = {};
  }
  setNestedEnv(obj[key] as NestedEnv, path.slice(1), value, verbose);
}

/**
 * Adds the env to the process.env directly, returns a function to remove previously added env.
 */
export function resolveEnv(
  mode: string,
  envDir: string,
  prefixes: string | string[] = DEFAULT_CONFIG.ENV_PREFIX
) {
  const isPrefixesArray = Array.isArray(prefixes);
  if (isPrefixesArray && !prefixes.includes(DEFAULT_CONFIG.ENV_PREFIX)) {
    prefixes.push(DEFAULT_CONFIG.ENV_PREFIX);
  }
  const env: Record<string, string | boolean> = loadEnv(mode, envDir, prefixes);

  // Get the primary prefix for environment variable names
  const primaryPrefix = isPrefixesArray ? prefixes[0] : prefixes;

  // First, copy any existing environment variables that match our prefixes
  const existingEnv = Object.entries(process.env).reduce(
    (acc, [key, value]) => {
      if (
        value &&
        (isPrefixesArray
          ? prefixes.some((p) => key.startsWith(p))
          : key.startsWith(prefixes))
      ) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>
  );

  // Merge existing env with loaded env, preferring existing values
  const mergedEnv = { ...env, ...existingEnv };

  const modeKey = getEnvKey("MODE", primaryPrefix);
  if (!mergedEnv[modeKey] && process.env[modeKey] == null) {
    const modeIndex = process.argv.findIndex((arg) => arg === "--mode");
    const isBuild = process.argv.includes("build");
    const isPreview = process.argv.includes("preview");
    if (modeIndex === -1) {
      const inferredMode = isPreview || isBuild ? "production" : "development";
      if (
        inferredMode === "production" &&
        process.env["NODE_ENV"] !== "production"
      ) {
        console.warn(
          `NODE_ENV is not ${inferredMode} (${process.env["NODE_ENV"]}) but ${modeKey} is ${inferredMode}, NODE_ENV takes precedence`
        );
        mergedEnv[modeKey] = getNodeEnv();
      } else if (
        inferredMode === "development" &&
        process.env["NODE_ENV"] !== "development"
      ) {
        if (process.env["NODE_ENV"] === "test") {
          if (process.env["NODE_ENV"] !== "test") {
            console.warn(
              `NODE_ENV is not ${inferredMode} (${process.env["NODE_ENV"]}) but ${modeKey} is ${mode}, NODE_ENV takes precedence`
            );
          }
          mergedEnv[modeKey] = "development";
        } else {
          console.warn(
            `NODE_ENV is not ${inferredMode} (${process.env["NODE_ENV"]}) but ${modeKey} is ${mode}, NODE_ENV takes precedence`
          );
          mergedEnv[modeKey] = getNodeEnv();
        }
      } else {
        mergedEnv[modeKey] = inferredMode;
      }
    } else {
      // Check if the mode value is in the next argument
      const modeValue = process.argv[modeIndex + 1];
      if (modeValue && !modeValue.startsWith("--")) {
        mergedEnv[modeKey] = modeValue;
      } else {
        // Fallback to default mode
        mergedEnv[modeKey] =
          process.env["NODE_ENV"] === "production"
            ? "production"
            : "development";
      }
    }
  }

    const baseUrlKey = getEnvKey("BASE_URL", primaryPrefix);
  const ssrKey = getEnvKey("SSR", primaryPrefix);
  const devKey = getEnvKey("DEV", primaryPrefix);
  const prodKey = getEnvKey("PROD", primaryPrefix);
  const publicOriginKey = getEnvKey("PUBLIC_ORIGIN", primaryPrefix);

  if (!mergedEnv[baseUrlKey]) mergedEnv[baseUrlKey] = "/";
  if (!mergedEnv[ssrKey])
    mergedEnv[ssrKey] = String(
      process.argv.includes("--ssr") || getCondition("") === "server"
    );
  if (!mergedEnv[devKey]) mergedEnv[devKey] = mergedEnv[modeKey] === "development";
  if (!mergedEnv[prodKey]) mergedEnv[prodKey] = mergedEnv[modeKey] === "production";
  if (!mergedEnv[publicOriginKey]) mergedEnv[publicOriginKey] = "";

  if (!Object.keys(mergedEnv).length) return () => {};
  const addedEnv: NestedEnv = {};
  const exclude = isPrefixesArray
    ? (key: string) => !prefixes.some((prefix) => key.startsWith(prefix))
    : (key: string) => !key.startsWith(prefixes);

  for (const key in mergedEnv) {
    if (exclude(key)) continue;
    if (process.env[key] != null) {
      // Environment variable was already set - don't override it or include it in cleanup
      continue;
    }
    process.env[key] = mergedEnv[key] as string;
    addedEnv[key] = mergedEnv[key];
  }
  return createCleanupEnv(addedEnv);
}

export function resolveConfigDefine(
  resolvedConfig: Pick<ResolvedConfig, "define" | "envPrefix">,
  verbose = false
) {
  const { define } = resolvedConfig;
  const addedEnv: NestedEnv = {};
  const envPrefix = Array.isArray(resolvedConfig.envPrefix)
    ? resolvedConfig.envPrefix[0]
    : resolvedConfig.envPrefix;
  for (const key in define) {
    if (!key || !key.startsWith(`process.env.${envPrefix}`)) continue;
    const withoutPrefix = key.split("process.env.")[1];
    if (typeof define[key] === "string") {
      const path = withoutPrefix.split(".");
      setNestedEnv(addedEnv, path, define[key] as string, verbose);
      if (!process.env[path[0]]) process.env[path[0]] = {} as never;
      setNestedEnv(
        process.env[path[0]] as never,
        path.slice(1),
        define[key] as string,
        verbose
      );
    }
  }
  return createCleanupEnv(addedEnv);
}

export function createCleanupEnv(env: NestedEnv) {
  return () => {
    for (const key in env) {
      delete process.env[key];
    }
  };
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
