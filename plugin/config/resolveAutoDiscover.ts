import type { ConfigEnv, UserConfig } from "vite";
import type {
  CheckFilesExistReturn,
  InputNormalizer,
  ResolvedUserOptions,
  AutoDiscoveredFiles,
} from "../types.js";
import { join } from "path";
import { glob } from "fs/promises";
import { pluginRoot } from "../root.js";
import { checkFilesExist } from "../checkFilesExist.js";
import { resolvePages } from "./resolvePages.js";
import { tryManifest } from "../helpers/tryManifest.js";
import type { Manifest } from "vite";

let stashedAutoDiscover: Record<string, AutoDiscoveredFiles | null> = {};

const autoDiscoveredClientFiles = async ({
  inputs,
  userOptions,
  root,
  normalizer,
  staticManifest,
}: {
  inputs: Record<string, string>;
  userOptions: Pick<ResolvedUserOptions, "moduleBase">;
  root: string;
  normalizer: (path: string) => [string, string];
  staticManifest?: Manifest;
}) => {
  const allFiles = glob(`**/*.client.*`, {
    cwd: join(root, userOptions.moduleBase),
  });
  for await (const file of allFiles) {
    const [key, value] = normalizer(join(userOptions.moduleBase, file));
    if (!inputs[key]) {
      // If we have a static manifest, use its file name
      if (staticManifest && staticManifest[key]?.file) {
        inputs[staticManifest[key].file] = value;
      } else {
        inputs[key] = value;
      }
    } else {
      console.warn(`[RSC] Client file already exists: ${key}`);
    }
  }
  return inputs;
};

const autoDiscoveredServerFiles = async ({
  inputs,
  userOptions,
  root,
  normalizer,
}: {
  inputs: Record<string, string>;
  userOptions: Pick<ResolvedUserOptions, "moduleBase">;
  root: string;
  normalizer: (path: string) => [string, string];
}) => {
  const allFiles = glob(join(userOptions.moduleBase, "**/*.server.*"), {
    cwd: join(root, userOptions.moduleBase),
  });
  for await (const file of allFiles) {
    const [key, value] = normalizer(join(userOptions.moduleBase, file));
    if (!inputs[key]) {
      inputs[key] = value;
    } else {
      console.warn(`[RSC] Server file already exists: ${key}`);
    }
  }
  return inputs;
};

const customWorkerFiles = ({
  inputs,
  userOptions,
}: {
  inputs: Record<string, string>;
  userOptions: Pick<ResolvedUserOptions, "rscWorkerPath" | "htmlWorkerPath">;
}) => {
  const customRscWorker = !userOptions.rscWorkerPath.startsWith(pluginRoot);
  const customHtmlWorker = !userOptions.htmlWorkerPath.startsWith(pluginRoot);
  if (customRscWorker && !inputs["rsc-worker"]) {
    inputs["rsc-worker"] = userOptions.rscWorkerPath;
  }
  if (customHtmlWorker && !inputs["html-worker"]) {
    inputs["html-worker"] = userOptions.htmlWorkerPath;
  }
  return inputs;
};

const autoDiscoveredPagePropFiles = ({
  files,
  inputs,
  normalizer: _normalizer,
}: {
  files: CheckFilesExistReturn | undefined;
  inputs: Record<string, string>;
  normalizer: (path: string) => [string, string];
}) => {
  if (!files) return inputs;

  // Add page files without extra prefix
  for (const [key, value] of files.pageMap) {
    if (!inputs[key]) {
      inputs[key] = value;
    } else {
      console.warn(`[RSC] Page file already exists: ${key}`);
    }
  }

  // Add props files without extra prefix
  for (const [key, value] of files.propsMap) {
    if (!inputs[key]) {
      inputs[key] = value;
    } else {
      console.warn(`[RSC] Props file already exists: ${key}`);
    }
  }

  return inputs;
};

type ResolveAutoDiscoverProps = {
  config: UserConfig;
  configEnv: ConfigEnv;
  userOptions: Pick<
    ResolvedUserOptions,
    | "build"
    | "moduleBase"
    | "serverEntry"
    | "clientEntry"
    | "projectRoot"
    | "Page"
    | "props"
    | "rscWorkerPath"
    | "htmlWorkerPath"
    | "normalizer"
  >;
  root: string;
  normalizer: InputNormalizer;
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
  root,
  normalizer,
}: ResolveAutoDiscoverProps): Promise<ResolveAutoDiscoverReturn> {
  const ssr =
    condition === "react-server"
      ? true
      : typeof config.build?.ssr === "boolean"
      ? config.build?.ssr
      : configEnv.isSsrBuild;
  const envDir = !ssr ? userOptions.build.client : userOptions.build.server;
  const envId = `${envDir}${ssr ? "-ssr" : ""}`;
  const configInputRecord = {} as Record<string, string>;
  if(typeof config.build?.rollupOptions?.input === 'string') {
    configInputRecord[normalizer(config.build?.rollupOptions?.input)[0]] = config.build?.rollupOptions?.input;
  } else if(typeof config.build?.rollupOptions?.input === 'object') {
    for(const [, value] of Object.entries(config.build?.rollupOptions?.input)) {
      configInputRecord[normalizer(value)[0]] = value;
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
      ? Object.fromEntries([normalizer(userOptions.serverEntry)])
      : null;

  const indexHtml = { index: "index.html" };

  const clientEntry =
    typeof userOptions.clientEntry === "string"
      ? Object.fromEntries([userOptions.clientEntry].map(normalizer))
      : {};

  const { type, error, pages } = await resolvePages(userOptions.build.pages);

  if (type === "error") {
    return {
      type: "error",
      error,
    };
  }

  const files = await checkFilesExist({
    pages,
    options: {
      build: userOptions.build,
      moduleBase: userOptions.moduleBase,
      Page: userOptions.Page,
      props: userOptions.props,
      projectRoot: userOptions.projectRoot,
      normalizer: userOptions.normalizer,
    },
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

  const workerPaths = customWorkerFiles({
    inputs: {},
    userOptions: {
      rscWorkerPath: userOptions.rscWorkerPath,
      htmlWorkerPath: userOptions.htmlWorkerPath,
    },
  });
  const clientFiles = await autoDiscoveredClientFiles({
    inputs: {},
    userOptions,
    root,
    normalizer,
    staticManifest,
  });
  const serverFiles = await autoDiscoveredServerFiles({
    inputs: {},
    userOptions: userOptions,
    root: root,
    normalizer: normalizer,
  });

  const pageAndPropFiles = autoDiscoveredPagePropFiles({
    files,
    inputs: {},
    normalizer,
  })
  // Add inputs based on condition
  const inputs =
    condition === "react-client"
      ? { ...configInputRecord, ...clientFiles, ...clientEntry, ...serverFiles, ...indexHtml, ...serverEntry }
      : {
          ...configInputRecord,
          ...clientFiles,
          ...clientEntry,
          ...serverFiles,
          ...serverEntry,
          ...workerPaths,
          ...pageAndPropFiles,
        };
  stashedAutoDiscover[envId] = {
    ...files,
    workerPaths,
    serverEntry,
    clientEntry,
    staticManifest,
    inputs,
  };
  return {
    type: "success",
    autoDiscoveredFiles: stashedAutoDiscover[envId],
  };
}
