import { readFileSync } from "node:fs";
import { detectClientModule } from "react-server-loader/directives";
import type { AutoDiscoveredFiles } from "../types.js";
import type { RouteTree } from "../router/fileRouter.js";

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

/**
 * Split a css file's client-graph modules into the ones Vite's native css
 * HMR can actually hot-swap: nodes with a JS importer other than the file
 * itself (a "use client" component importing the stylesheet). A
 * server-collected stylesheet served as <link> also gets client-graph nodes
 * from the browser's fetch (the url node and its ?direct twin) with no such
 * importer — letting those ride into propagation dead-ends Vite into a full
 * page reload, wiping the client state the refetch + link cache-bust path
 * exists to preserve. Returning ONLY the swappable modules from `hotUpdate`
 * keeps both worlds: genuinely client-imported css hot-swaps in place, the
 * link-delivered copy cache-busts via the kind:"css" event, and nothing
 * dead-ends.
 */
// deno-lint-ignore no-explicit-any — callers hand Vite's EnvironmentModuleNode
// (or the legacy ModuleNode) through an untyped hook ctx; the filter only
// touches `importers` and must return the SAME nodes for Vite to propagate.
export const clientOwnedCssModules = <M,>(
  modules: M[] | undefined,
  cssFile: string
): M[] =>
  (modules ?? []).filter((m) =>
    [...(((m as { importers?: Set<unknown> }).importers ?? []) as Set<{ file?: string | null; id?: string | null }>)].some(
      (imp) => {
        const impFile = (imp?.file ?? imp?.id ?? "").split("?")[0];
        return !!impFile && impFile !== cssFile;
      }
    )
  );

type ServerGraphLookup = {
  environments?: Record<
    string,
    { moduleGraph?: { getModulesByFile(file: string): Set<unknown> | undefined } } | undefined
  >;
};

/**
 * True when the server environment's module graph imports `file`. Content
 * the server tree reads without a script extension, or from outside the
 * module base (markdown through `?raw` globs, JSON data), never matches the
 * path/extension heuristics in the hotUpdate hooks; the graph knows exactly
 * what the last render pulled in. node_modules stay out so a dependency's
 * own churn does not refetch every open page.
 */
export function isServerGraphFile(
  server: ServerGraphLookup | undefined,
  file: string,
): boolean {
  if (!server || file.includes("/node_modules/")) return false;
  const mods = server.environments?.["server"]?.moduleGraph?.getModulesByFile(file);
  return !!mods && mods.size > 0;
}

type RouteTreeWatchServer = {
  watcher: { on(event: "add" | "unlink", cb: (file: string) => void): unknown };
  restart(): Promise<void>;
  config: { logger: { info(msg: string): void; error(msg: string): void } };
};

/**
 * Keep the `routes` table in step with the route tree while the dev server
 * runs. The table is a scan of the tree; every route file added or removed
 * rescans it, synchronously, before Vite's own hot update for the file runs
 * (the watcher calls listeners at once, Vite's handler after an await):
 *
 * - The table's resolvers (Page, props, layouts) switch to the new scan, and
 *   the per-url page/props resolutions the dev server cached are dropped.
 *   Vite's hot update for the file then runs as for any other module (server
 *   and client graphs invalidated, client HMR), and the dev plugins'
 *   `hotUpdate` sends the flight refetch, so the open page updates in place.
 * - When a route appeared or disappeared, config derived from the route list
 *   at resolve time (build inputs) is stale too, so the server restarts as
 *   well. Plugin instances passed inline survive a restart and keep this
 *   table, so every change rescans, including one that lands while a restart
 *   is pending; only the restart itself is coalesced. A file written while
 *   the restart swaps servers reaches neither watcher (the old one closes
 *   first, the new one's initial scan takes it in silently), so the tree is
 *   rescanned once the restart is done.
 *
 * Edits need nothing here: the file set is unchanged and HMR reloads the
 * module.
 */
export function watchRouteTree(
  server: RouteTreeWatchServer,
  opts: {
    routeTree: RouteTree | undefined;
    autoDiscoveredFiles: Pick<AutoDiscoveredFiles, "urlMap">;
  },
): void {
  const { routeTree } = opts;
  if (!routeTree) return;
  let pendingRestart: ReturnType<typeof setTimeout> | undefined;
  const rescan = (cause: string) => {
    let routeSetChanged: boolean;
    try {
      ({ routeSetChanged } = routeTree.rescan());
    } catch (error) {
      // A tree the scan rejects (two pages on one url) keeps the last good
      // table until it is fixed; a restart would not scan any differently.
      server.config.logger.error(
        `[vite-plugin-react-server] ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    opts.autoDiscoveredFiles.urlMap.clear();
    if (!routeSetChanged || pendingRestart) return;
    server.config.logger.info(
      `[vite-plugin-react-server] route added or removed (${cause}), restarting to rescan routes`,
    );
    // A burst (a folder moved in, several files saved at once) coalesces into
    // one restart.
    pendingRestart = setTimeout(() => {
      pendingRestart = undefined;
      void server
        .restart()
        .then(() => rescan("while the server restarted"));
    }, 50);
  };
  const onChange = (file: string) => {
    if (routeTree.isRouteFile(file)) rescan(file);
  };
  server.watcher.on("add", onChange);
  server.watcher.on("unlink", onChange);
}

/**
 * True when a hot update adds or removes a route file. The server tree around
 * it changed even when the file is a `"use client"` module whose own update
 * Vite owns, so `hotUpdate` sends the flight refetch for it either way.
 */
export function isRouteTreeAddOrRemove(
  routeTree: RouteTree | undefined,
  ctx: { type?: string; file: string },
): boolean {
  return (
    !!routeTree &&
    (ctx.type === "create" || ctx.type === "delete") &&
    routeTree.isRouteFile(ctx.file)
  );
}
