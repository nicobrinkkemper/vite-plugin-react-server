import { relative } from "node:path";
import { fileURLToPath } from "node:url";
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
    | "routePatterns"
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


    
    // vprs ships its client router (Link / RouterProvider / useParams) as a
    // "use client" package export. When a SERVER component imports it directly,
    // the react-server build records a client reference at vprs's node_modules
    // path — but nothing in the CLIENT graph pulls that file in, so it is never
    // emitted and the reference dangles (ERR_MODULE_NOT_FOUND). Add vprs's own
    // client barrel as a client build input so it is always hosted at the
    // reference path. Gated on a configured file router (routePatterns present)
    // so consumers that don't use the router don't emit an unused chunk.
    // node_modules "use client" files are otherwise skipped as build inputs
    // (see createDirectiveClientAutoDiscover), which is why this is explicit.
    // Value must be project-root-relative: env config strips a leading "/" from
    // input paths, so an absolute path would be mangled. `relative` also keeps
    // the node_modules/... shape so preserveModules emits the chunk at the
    // client-reference path the server build points to. Skip when the barrel is
    // hoisted above the project root (rel escapes with ".."): it can't be
    // emitted at the reference path anyway, so adding it would only produce a
    // broken/orphan input.
    const routerClientInput: Record<string, string> = ((): Record<
      string,
      string
    > => {
      if (!(userOptions.routePatterns && userOptions.routePatterns.length > 0))
        return {};
      const rel = relative(
        userOptions.projectRoot,
        fileURLToPath(new URL("../../router/client.js", import.meta.url))
      );
      if (!rel || rel.startsWith("..")) return {};
      return { "vprs-router-client": rel };
    })();

    // Separate client and server inputs
    const clientInputsCollection = {
      ...configInputRecord,
      ...clientInputs,
      ...directiveClientInputs,
      ...clientEntry,
      ...cssInputs,
      ...routerClientInput,
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
