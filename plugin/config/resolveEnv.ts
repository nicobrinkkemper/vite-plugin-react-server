import { loadEnv, type ResolvedConfig } from "vite";
import { DEFAULT_CONFIG } from "./defaults.js";
import { getCondition } from "./getCondition.js";

type NestedEnv = {
  [key: string]: unknown | NestedEnv;
};

function setNestedEnv(obj: NestedEnv, path: string[], value: string) {
  if (!path.length) return;
  const key = path[0];
  console.log("setNestedEnv:", { key, path, value, currentObj: obj[key] });
  if (path.length === 1) {
    obj[key] = value;
    return;
  }
  if (!obj[key] || typeof obj[key] === "string") {
    obj[key] = {};
  }
  setNestedEnv(obj[key] as NestedEnv, path.slice(1), value);
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

  if (!mergedEnv["VITE_MODE"] && process.env["VITE_MODE"] == null) {
    const modeIndex = process.argv.findIndex((arg) => arg === "--mode");
    const isBuild = process.argv.includes("build");
    const isPreview = process.argv.includes("preview");
    if (modeIndex === -1) {
      const inferredMode = isPreview || isBuild
        ? "production"
        : "development";
      if (
        inferredMode === "production" &&
        process.env["NODE_ENV"] !== "production"
      ) {
        console.warn(
          `NODE_ENV is not ${inferredMode} but VITE_MODE is ${inferredMode}, NODE_ENV takes precedence`
        );
        mergedEnv["VITE_MODE"] =
          process.env["NODE_ENV"] === "production"
            ? "production"
            : "development";
      } else if (
        inferredMode === "development" &&
        process.env["NODE_ENV"] !== "development"
      ) {
        console.warn(
          `NODE_ENV is not ${inferredMode} but VITE_MODE is ${inferredMode}, NODE_ENV takes precedence`
        );
        mergedEnv["VITE_MODE"] =
          process.env["NODE_ENV"] === "development"
            ? "development"
            : "production";
      } else {
        mergedEnv["VITE_MODE"] = inferredMode;
      }
    } else {
      // Check if the mode value is in the next argument
      const modeValue = process.argv[modeIndex + 1];
      if (modeValue && !modeValue.startsWith("--")) {
        mergedEnv["VITE_MODE"] = modeValue;
      } else {
        // Fallback to default mode
        mergedEnv["VITE_MODE"] =
          process.env["NODE_ENV"] === "production"
            ? "production"
            : "development";
      }
    }
  }

  if (!mergedEnv["VITE_BASE_URL"] && process.env["VITE_BASE_URL"] != null)
    mergedEnv["VITE_BASE_URL"] = "/";
  if (!mergedEnv["VITE_SSR"] && process.env["VITE_SSR"] == null)
    mergedEnv["VITE_SSR"] =
      String(process.argv.includes("--ssr") || getCondition("") === "server");
  if (!mergedEnv["VITE_DEV"] && process.env["VITE_DEV"] == null)
    mergedEnv["VITE_DEV"] = mergedEnv["VITE_MODE"] === "development";
  if (!mergedEnv["VITE_PROD"] && process.env["VITE_PROD"] == null)
    mergedEnv["VITE_PROD"] = mergedEnv["VITE_MODE"] === "production";
  if (
    !mergedEnv["VITE_PUBLIC_ORIGIN"] &&
    process.env["VITE_PUBLIC_ORIGIN"] == null
  )
    mergedEnv["VITE_PUBLIC_ORIGIN"] = "";

  if (!Object.keys(mergedEnv).length) return () => {};
  const addedEnv: NestedEnv = {};
  const exclude = isPrefixesArray
    ? (key: string) => !prefixes.some((prefix) => key.startsWith(prefix))
    : (key: string) => !key.startsWith(prefixes);

  for (const key in mergedEnv) {
    if (exclude(key)) continue;
    if (process.env[key] != null) {
      continue;
    }
    process.env[key] = mergedEnv[key] as string;
    addedEnv[key] = mergedEnv[key];
  }
  return createCleanupEnv(addedEnv);
}

export function resolveConfigDefine(
  resolvedConfig: Pick<ResolvedConfig, "define" | "envPrefix">
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
      setNestedEnv(addedEnv, path, define[key] as string);
      if (!process.env[path[0]]) process.env[path[0]] = {} as any;
      setNestedEnv(
        process.env[path[0]] as any,
        path.slice(1),
        define[key] as string
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
