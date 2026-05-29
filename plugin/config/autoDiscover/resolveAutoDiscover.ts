import { type ConfigEnv, type UserConfig } from "vite";
import type { AutoDiscoveredFiles, ResolvedUserOptions } from "../../types.js";
import { resolveBuildPages } from "./resolveBuildPages.js";
import { resolvePages } from "../resolvePages.js";
import type { Logger, ResolvedConfig } from "vite";
import { createGlobAutoDiscover } from "./createGlobAutoDiscover.js";
import { createDirectiveClientAutoDiscover } from "./createDirectiveClientAutoDiscover.js";
import { customWorkerFiles } from "./customWorkerFiles.js";
import { pageAndPropFiles } from "./pageAndPropFiles.js";



type ResolveAutoDiscoverProps = {
  config: UserConfig | ResolvedConfig;
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
    | "verbose"
    | "panicThreshold"
    | "autoDiscover"
  >;
  logger: Logger;
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
      error: unknown;
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
    logger,
  }) {
    const envId = `${configEnv.command}-${configEnv.mode}`;
    

    
    
    

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
    const clientFiles = createGlobAutoDiscover(userOptions.autoDiscover.clientEntry);
    // First-party modules detected by a top-of-file `"use client"` directive
    // (no `.client.` suffix) must also be emitted to dist/client.
    const directiveClientFiles = createDirectiveClientAutoDiscover();
    const serverFiles = createGlobAutoDiscover(userOptions.autoDiscover.serverEntry);
    const cssFiles = createGlobAutoDiscover(userOptions.autoDiscover.cssEntry);
    const jsonFiles = createGlobAutoDiscover(userOptions.autoDiscover.jsonEntry);
    const htmlFiles = createGlobAutoDiscover(userOptions.autoDiscover.htmlPattern.source);

    const files = await resolveBuildPages({
      pages,
      userOptions,
      logger,
    });

 

    const customWorkerInputs = customWorkerFiles({
      inputs: {},
      userOptions,
    });
    const clientInputs = await clientFiles({
      inputs: {},
      userOptions,
    });
    const directiveClientInputs = await directiveClientFiles({
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

    const htmlInputs = await htmlFiles({
      inputs: {},
      userOptions,
    });

    // Add custom Root and Html components to inputs
    const customComponentInputs: Record<string, string> = {};

    // Add Root components from resolved build pages
    for (const [rootKey, rootValue] of files.rootMap) {
      if (!customComponentInputs[rootKey]) {
        customComponentInputs[rootKey] = rootValue;
      }
    }

    // Add Html components from resolved build pages
    for (const [htmlKey, htmlValue] of files.htmlMap) {
      if (!customComponentInputs[htmlKey]) {
        customComponentInputs[htmlKey] = htmlValue;
      }
    }


    
    // Separate client and server inputs
    const clientInputsCollection = {
      ...configInputRecord,
      ...clientInputs,
      ...directiveClientInputs,
      ...clientEntry,
      ...cssInputs,
    };
    // If no client entries found, fall back to index.html so SSR environment has inputs
    if (Object.keys(clientInputsCollection).length === 0) {
      Object.assign(clientInputsCollection, indexHtmlInputs);
    }
    
    const serverInputsCollection = {
      ...clientInputsCollection,
      ...customWorkerInputs,
      ...pageAndPropInputs,
      ...cssInputs,
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
        staticInputs: {
          ...indexHtmlInputs,
          ...htmlInputs,
          ...clientInputsCollection
        },
        clientInputs: clientInputsCollection,
        serverInputs: serverInputsCollection,
        serverActions,
      },
    };
  };
