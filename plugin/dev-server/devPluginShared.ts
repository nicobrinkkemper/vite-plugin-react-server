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

/**
 * The dev document's transport hint, shared by both dev plugins.
 *
 * With transport:"webpack" the dev server produces webpack-flavored flight,
 * and the (transport-agnostic) client entry picks its flight client off
 * `self.__vprsFlightTransport` — the same inline hint the baked pair's
 * documents carry (see createEdgeRequestHandler). Vite serves the dev
 * document itself, so the hint rides in via transformIndexHtml; a classic
 * inline script in <head> runs during parse, strictly before any module —
 * the client entry can never read the flag too early.
 *
 * Returns undefined on the default esm transport: no tag, byte-for-byte
 * today's document.
 */
export function devFlightTransportTags(
  userOptions: Pick<import("../types.js").ResolvedUserOptions, "transport">
):
  | { tag: string; children: string; injectTo: "head-prepend" }[]
  | undefined {
  if (userOptions.transport !== "webpack") return undefined;
  return [
    {
      tag: "script",
      children: 'self.__vprsFlightTransport="webpack";',
      injectTo: "head-prepend",
    },
  ];
}
