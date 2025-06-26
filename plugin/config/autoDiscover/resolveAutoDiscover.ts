import type { ConfigEnv, UserConfig } from "vite";
import type {
  AutoDiscoveredFiles,
  ResolvedUserOptions,
} from "../../types.js";
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

type ResolveAutoDiscoverProps = {
  config: UserConfig;
  configEnv: ConfigEnv;
  userOptions: Pick<
    ResolvedUserOptions,
    | "build"
    | "normalizer"
    | "serverEntry"
    | "clientEntry"
    | "projectRoot"
    | "moduleBase"
    | "moduleBasePath"
    | "Page"
    | "props"
    | "htmlWorkerPath"
    | "rscWorkerPath"
    | "pageExportName"
    | "propsExportName"
    | "htmlExportName"
    | "rootExportName"  
    | "Root"
    | "Html"
  >;
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

export type ResolveAutoDiscoverFn = (
  props: ResolveAutoDiscoverProps
) => Promise<ResolveAutoDiscoverReturn>;

export const resolveAutoDiscover: ResolveAutoDiscoverFn =
  async function _resolveAutoDiscover({
    config,
    configEnv,
    userOptions,
    condition,
  }) {
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
    if (ssr && configEnv.command === "build") {
      const staticManifestResult = await tryManifest({
        root: userOptions.projectRoot,
        ssrManifest: false,
        outDir: join(userOptions.build.outDir, userOptions.build.static),
      });
      if (staticManifestResult.type === "success") {
        staticManifest = staticManifestResult.manifest;
      } else if (configEnv.command === "build") {
        // in dev mode the static manifest is not needed
        // without ssr, WE ARE BUILDING the static manifest, so only warn in the case of a build
        if (staticManifestResult.type === "error") {
          console.error(staticManifestResult.error);
        }
        console.warn("Continuing without static manifest");
        // this can still work, but, it won't be able to look up any client-side assets
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
    const serverActions = await serverFiles({
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

    // Add custom Root and Html components to inputs
    const customComponentInputs: Record<string, string> = {};
    if (typeof userOptions.Root === "string") {
      const [rootKey] = userOptions.normalizer(userOptions.Root);
      customComponentInputs[rootKey] = userOptions.Root;
    }
    if (typeof userOptions.Html === "string") {
      const [htmlKey] = userOptions.normalizer(userOptions.Html);
      customComponentInputs[htmlKey] = userOptions.Html;
    }

    const agnosticInputs = {
      ...configInputRecord,
      ...clientInputs,
      ...clientEntry,
      ...cssInputs,
    };
    // Add inputs based on condition
    const inputs =
      condition === "react-client"
        ? {
            ...indexHtmlInputs,
            ...agnosticInputs,
          }
        : {
            ...configInputRecord,
            ...customWorkerInputs,
            ...pageAndPropInputs,
            ...agnosticInputs,
            ...serverActions,
            ...serverEntry,
            ...jsonInputs,
            ...customComponentInputs, // Add custom components to server build
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
        serverActions,
      },
    };
  };
