import type { ConfigEnv, UserConfig } from "vite";
import type { ResolvedUserOptions, AutoDiscoveredFiles } from "../types.js";
import { join } from "path";
import { resolveBuildPages } from "./autoDiscover/resolveBuildPages.js";
import { resolvePages } from "./resolvePages.js";
import { tryManifest } from "../helpers/tryManifest.js";
import type { Manifest } from "vite";
import { createGlobAutoDiscover } from "./autoDiscover/createGlobAutoDiscover.js";
import { collectBundleManifestCss } from "../helpers/collectBundleManifestCss.js";
import { customWorkerFiles } from "./autoDiscover/customWorkerFiles.js";
import { pageAndPropFiles } from "./autoDiscover/pageAndPropFiles.js";

let stashedAutoDiscover: Record<string, AutoDiscoveredFiles | null> = {};

const clientFiles = createGlobAutoDiscover("**/*.client.*");
const serverFiles = createGlobAutoDiscover("**/*.server.*");
const cssFiles = createGlobAutoDiscover("**/*.css");
const jsonFiles = createGlobAutoDiscover("**/*.json");

type ResolveAutoDiscoverProps = {
  config: UserConfig;
  configEnv: ConfigEnv;
  userOptions: ResolvedUserOptions;
  condition: "react-server" | "react-client";
};

type ResolveAutoDiscoverReturn =
  | {
      type: "success";
      autoDiscoveredFiles: AutoDiscoveredFiles;
      error?: never;
    }
  | {
      type: "error";
      error: Error;
      autoDiscoveredFiles?: never;
    };

export async function resolveAutoDiscover({
  config,
  configEnv,
  userOptions,
  condition,
}: ResolveAutoDiscoverProps): Promise<ResolveAutoDiscoverReturn> {
  const ssr = configEnv.isSsrBuild;
  const envDir =
    condition === "react-server"
      ? userOptions.build.server
      : ssr
      ? userOptions.build.client
      : userOptions.build.static;
  const envId = `${envDir}${ssr ? "-ssr" : ""}`;
  const configInputRecord = {} as Record<string, string>;
  if (typeof config.build?.rollupOptions?.input === "string") {
    configInputRecord[
      userOptions.normalizer(config.build?.rollupOptions?.input)[0]
    ] = config.build?.rollupOptions?.input;
  } else if (typeof config.build?.rollupOptions?.input === "object") {
    for (const [, value] of Object.entries(
      config.build?.rollupOptions?.input
    )) {
      configInputRecord[userOptions.normalizer(value)[0]] = value;
    }
  }
  if (stashedAutoDiscover[envId]) {
    return {
      type: "success",
      autoDiscoveredFiles: stashedAutoDiscover[envId],
    };
  }

  const serverEntry =
    typeof userOptions.serverEntry === "string"
      ? Object.fromEntries([userOptions.normalizer(userOptions.serverEntry)])
      : null;

  const indexHtmlInputs = { index: "index.html" };

  const clientEntry =
    typeof userOptions.clientEntry === "string"
      ? Object.fromEntries([userOptions.normalizer(userOptions.clientEntry)])
      : {};

  const { type, error, pages } = await resolvePages(userOptions.build.pages);

  if (type === "error") {
    return {
      type: "error",
      error,
    };
  }

  const files = await resolveBuildPages({
    pages,
    userOptions,
  });

  // Load static manifest for client build
  let staticManifest: Manifest = {};
  if (ssr) {
    const staticManifestResult = await tryManifest({
      root: userOptions.projectRoot,
      ssrManifest: false,
      outDir: join(userOptions.build.outDir, userOptions.build.static),
    });
    if (staticManifestResult.type === "success") {
      staticManifest = staticManifestResult.manifest;
    }
  }

  const customWorkerInputs = customWorkerFiles({
    inputs: {},
    userOptions,
  });
  const clientInputs = await clientFiles({
    inputs: {},
    userOptions,
  });
  const serverInputs = await serverFiles({
    inputs: {},
    userOptions,
  });

  const pageAndPropInputs = pageAndPropFiles({
    files,
    inputs: {},
  });

  const cssInputs = await cssFiles({
    inputs: {},
    userOptions,
  });

  const jsonInputs = await jsonFiles({
    inputs: {},
    userOptions,
  });
  // lastly, make sure we handle the index.html dependencies
  let indexHtmlCssInputs: Record<string, string> = {};
  if (ssr && staticManifest["index.html"]) {
    const indexHtmlCSS = await collectBundleManifestCss({
      id: "index.html",
      manifest: staticManifest,
      projectRoot: userOptions.projectRoot,
      moduleBasePath: userOptions.moduleBasePath,
      moduleBaseURL: userOptions.moduleBaseURL,
      moduleRootPath: userOptions.moduleRootPath,
      css: userOptions.css,
      build: userOptions.build,
    });
    for (const [key] of indexHtmlCSS.entries()) {
      const [keyNormalized, valueNormalized] = userOptions.normalizer(key);
      indexHtmlCssInputs[keyNormalized] = valueNormalized;
    }
  }
  const agnosticInputs = {
    ...configInputRecord,
    ...clientInputs,
    ...clientEntry,
    ...serverInputs,
    ...serverEntry,
    ...indexHtmlCssInputs,
  };
  // Add inputs based on condition
  const inputs = condition === "react-client"
    ? {
        ...indexHtmlInputs,
        ...agnosticInputs,
        ...cssInputs,
        ...jsonInputs,
      }
    : {
        ...configInputRecord,
        ...customWorkerInputs,
        ...pageAndPropInputs,
        ...agnosticInputs,
        ...cssInputs,
        ...jsonInputs,
      };

  stashedAutoDiscover[envId] = {
    ...files,
    workerPaths: customWorkerInputs,
    serverEntry,
    clientEntry,
    staticManifest,
    inputs,
    cssFiles: indexHtmlCssInputs,
  };
  return {
    type: "success",
    autoDiscoveredFiles: stashedAutoDiscover[envId],
  };
}
