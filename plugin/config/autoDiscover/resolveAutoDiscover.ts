import type { ConfigEnv, UserConfig } from "vite";
import type { ResolvedUserOptions, AutoDiscoveredFiles } from "../../types.js";
import { join } from "path";
import { resolveBuildPages } from "./resolveBuildPages.js";
import { resolvePages } from "../resolvePages.js";
import { tryManifest } from "../../helpers/tryManifest.js";
import type { Manifest } from "vite";
import { createGlobAutoDiscover } from "./createGlobAutoDiscover.js";
import { customWorkerFiles } from "./customWorkerFiles.js";
import { pageAndPropFiles } from "./pageAndPropFiles.js";

const clientFiles = createGlobAutoDiscover("**/*.client.*");
const serverFiles = createGlobAutoDiscover("**/*.server.*");
const cssFiles = createGlobAutoDiscover("**/*.css");
const jsonFiles = createGlobAutoDiscover("**/*.json");

type ResolveAutoDiscoverProps<T = unknown, InlineCSS extends boolean | undefined = undefined> = {
  config: UserConfig;
  configEnv: ConfigEnv;
  userOptions: ResolvedUserOptions<T, InlineCSS>;
  condition: "react-server" | "react-client";
};

type ResolveAutoDiscoverReturn =
  | {
      type: "success";
      id: string;
      autoDiscoveredFiles: AutoDiscoveredFiles;
      error?: never;
    }
  | {
      type: "error";
      error: Error;
      id: string;
      autoDiscoveredFiles?: never;
    };

export async function resolveAutoDiscover<T = unknown, InlineCSS extends boolean | undefined = undefined>({
  config,
  configEnv,
  userOptions,
  condition,
}: ResolveAutoDiscoverProps<T, InlineCSS>): Promise<ResolveAutoDiscoverReturn> {
  const ssr = configEnv.isSsrBuild || condition === "react-server";
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
      id: envId,
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
    } else if (configEnv.command === "build") {
      // in dev mode, the static manifest is not needed
      // with ssr, WE ARE BUILDING the static manifest, so only warn in the case of a build
      console.error(staticManifestResult.error);
      console.warn("Continuing without static manifest");
      // this can still work, but, it won't be able to look up any client-side assets
      // so likely the error will happen later in the build loader not being able to find the asset
      staticManifest = {};
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
  const agnosticInputs = {
    ...configInputRecord,
    ...clientInputs,
    ...clientEntry,
    ...serverInputs,
    ...serverEntry,
  };
  // Add inputs based on condition
  const inputs =
    condition === "react-client"
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
  return {
    type: "success",
    id: envId,
    autoDiscoveredFiles: {
      ...files,
      workerPaths: customWorkerInputs,
      serverEntry,
      clientEntry,
      staticManifest,
      inputs,
    },
  };
}
