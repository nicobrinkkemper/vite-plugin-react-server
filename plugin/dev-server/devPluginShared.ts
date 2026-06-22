import { readFileSync } from "node:fs";
import { detectClientModule } from "react-server-loader/directives";
import type { AutoDiscoveredFiles } from "../types.js";

/**
 * An empty AutoDiscoveredFiles. Both dev-server plugins (server + client) hand
 * this to configureReactServer at configureServer time; the real auto-discovery
 * happens later via configResolved. Kept in one place so the shape can't drift
 * between the two plugins.
 */
export function emptyAutoDiscoveredFiles(): AutoDiscoveredFiles {
  return {
    propsMap: new Map(),
    pageMap: new Map(),
    rootMap: new Map(),
    htmlMap: new Map(),
    routeMap: new Map(),
    urlMap: new Map(),
    errors: [],
    workerPaths: {},
    serverEntry: null,
    clientEntry: {},
    clientInputs: {},
    staticInputs: {},
    serverInputs: {},
    // staticManifest removed from AutoDiscoveredFiles
    serverActions: {},
  };
}

/**
 * Is `file` a "use client" source module — a JS/TS source whose contents carry a
 * client directive? Both dev plugins use this in `hotUpdate` to let Vite own
 * client-side HMR (Fast Refresh / reload) for client components rather than
 * routing the change through the RSC refetch / worker-invalidation path.
 */
export function isClientModuleFile(file: string): boolean {
  if (
    !(
      file.endsWith(".tsx") ||
      file.endsWith(".ts") ||
      file.endsWith(".jsx") ||
      file.endsWith(".js")
    )
  ) {
    return false;
  }
  try {
    const source = readFileSync(file, "utf-8");
    return detectClientModule({ source, moduleId: file });
  } catch {
    return false;
  }
}
