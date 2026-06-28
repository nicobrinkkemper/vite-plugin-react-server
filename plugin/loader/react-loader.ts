// vprs-side adapter for the React-RSC Node ESM loader. The actual
// load/resolve hooks live in react-server-loader/loader — this file
// threads vprs's worker context (parent MessagePort, serialized user
// options, the `createDefaultModuleID` policy) into rsl's factory and
// publishes the resulting hooks to the worker bootstrap path.

import type {
  ResolvedUserOptions,
  SerializedResolvedConfig,
  SerializedUserOptions,
} from "../types.js";
// Vite 8 swaps Rollup→Rolldown; source bundle types from Vite's version-agnostic Rollup namespace.
import type { Rollup } from "vite";
type ModuleInfo = Rollup.ModuleInfo;
import { parentPort } from "node:worker_threads";
import type { MessagePort } from "node:worker_threads";
import type {
  InitializedReactLoaderMessage,
  ServerModuleMessage,
} from "../worker/rsc/types.js";
import { join } from "node:path";
import { hydrateUserOptions } from "../helpers/hydrateUserOptions.js";
import type { LoadHook, ResolveHook } from "node:module";
import { createReactLoader } from "react-server-loader/loader";
import { createLogger, type Logger } from "vite";
import { createDefaultModuleID } from "../config/createModuleID.js";

export type LoaderOptions = {
  id: string;
  resolveDependencies?: boolean;
  format?: string;
  conditions?: string[];
  importAssertions?: Record<string, unknown>;
  importAttributes?: Record<string, unknown>;
  source: string;
};

export type LoaderFunction = (options: LoaderOptions) => Promise<ModuleInfo>;

let initialized = false;
let userOptions: ResolvedUserOptions;
let loaderPort: MessagePort | null;
let resolvedConfig: SerializedResolvedConfig;
let logger: Logger;
let verbose = false;
let load: LoadHook = async (url, context, nextLoad) => nextLoad(url, context);
let resolveHook: ResolveHook = async (specifier, context, nextResolve) =>
  nextResolve(specifier, context);

export function initialize(data: {
  id: string;
  port: MessagePort;
  userOptions: SerializedUserOptions;
  resolvedConfig: SerializedResolvedConfig;
}) {
  const {
    id,
    port,
    userOptions: serializedUserOptions,
    resolvedConfig: serializedResolvedConfig,
  } = data;

  verbose = serializedUserOptions?.verbose ?? false;
  logger = createLogger(serializedResolvedConfig?.logLevel ?? "info", {
    prefix: id,
  });
  resolvedConfig = serializedResolvedConfig;

  if (verbose) {
    logger.info(`Initializing with options: ${id}`);
  }
  loaderPort = port;

  const resolvedUserOptions = hydrateUserOptions(serializedUserOptions);
  if (resolvedUserOptions.type === "error") {
    throw resolvedUserOptions.error;
  }
  userOptions = resolvedUserOptions.userOptions;

  // Materialise vprs's default moduleID policy if the user didn't supply
  // one. Done here at init time so rsl's loader can reach for a stable
  // reference per call without recreating it.
  if (typeof userOptions.moduleID !== "function") {
    const buildConfigEnv =
      resolvedConfig?.configEnv ?? { command: "build", mode: "production" };
    userOptions.moduleID = createDefaultModuleID(
      {
        moduleBase: userOptions.moduleBase,
        moduleBasePath: userOptions.moduleBasePath,
        autoDiscover: userOptions.autoDiscover,
        build: userOptions.build,
        dev: userOptions.dev,
        moduleBaseURL: userOptions.moduleBaseURL,
        projectRoot: userOptions.projectRoot,
      },
      buildConfigEnv
    );
  }

  const { load: rslLoad, resolve: rslResolve } = createReactLoader({
    loader: userOptions.loader,
    verbose,
    logger,
    moduleID: (filePath) => {
      let moduleID = filePath;
      let finalID = filePath;
      if (userOptions?.normalizer) {
        const [, value] = userOptions.normalizer(filePath);
        moduleID = join(userOptions.moduleBasePath, value);
        finalID = userOptions.moduleID?.(moduleID) || moduleID;
      }
      return finalID;
    },
    onTransform: ({ filePath, transformedId, source }) => {
      if (loaderPort) {
        loaderPort.postMessage({
          type: "SERVER_MODULE",
          id: transformedId,
          url: filePath,
          source,
        } satisfies ServerModuleMessage);
      }
    },
  });

  load = rslLoad;
  resolveHook = rslResolve;

  if (!initialized && loaderPort) {
    loaderPort.postMessage({
      type: "INITIALIZED_REACT_LOADER",
      id,
    } satisfies InitializedReactLoaderMessage);
  }
  initialized = true;
}

// Module-level load/resolve hooks for the worker bootstrap path. They
// forward to whatever rsl's factory produced at init time; if init was
// skipped (unexpected) they fall back to a pass-through that lets the
// underlying loader chain handle the URL untouched.

export const loadHook: LoadHook = async (url, context, nextLoad) => {
  if (!initialized) {
    initialize({
      id: "react-loader",
      port: parentPort!,
      userOptions: {} as SerializedUserOptions,
      resolvedConfig: {} as SerializedResolvedConfig,
    });
  }
  return load(url, context, nextLoad);
};

export const resolve: ResolveHook = async (specifier, context, nextResolve) =>
  resolveHook(specifier, context, nextResolve);

export { loadHook as load };
