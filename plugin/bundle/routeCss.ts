import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedUserOptions } from "../types.js";

/**
 * The css a route's document must carry, read off the emitted manifests.
 *
 * One resolver, two consumers that must agree: emitHostManifests records it
 * per pattern as `cssByPattern` (what a host serves the route from), and the
 * webpack freeze hands it to the baked producer per route (what the frozen
 * document and its navigation flight link). The roots are the SSG pass's
 * (processCssFilesForPages): the page module, its props loader, and every
 * `route.tsx` layout wrapping the route with each layer's own props. A
 * stylesheet only props.ts or a layout imports — a loader-owned theme, a
 * per-section chrome — reaches the esm-frozen document through that pass; a
 * walk from the page alone served the same route unstyled from the manifest
 * and from the bake.
 */

export type ViteManifest = Record<
  string,
  | {
      file?: string;
      css?: string[];
      imports?: string[];
      isEntry?: boolean;
    }
  | undefined
>;

export function readViteManifest(dir: string): ViteManifest {
  const p = join(dir, ".vite/manifest.json");
  return existsSync(p)
    ? (JSON.parse(readFileSync(p, "utf8")) as ViteManifest)
    : {};
}

/**
 * Transitive css for a server module. The module's import graph lives in the
 * server manifest — but the css files ship with the browser-facing chunks in
 * the static manifest. Walk the server graph from the root, and collect css
 * for every visited source key from whichever manifest carries it (client
 * components appear in both).
 */
function cssClosure(
  graph: ViteManifest,
  cssSource: ViteManifest,
  key: string,
): string[] {
  const seen = new Set<string>();
  const css = new Set<string>();
  const visit = (k: string) => {
    if (seen.has(k)) return;
    seen.add(k);
    for (const f of cssSource[k]?.css ?? []) css.add(f);
    for (const f of graph[k]?.css ?? []) css.add(f);
    for (const imp of graph[k]?.imports ?? []) visit(imp);
  };
  visit(key);
  return [...css];
}

/**
 * Resolve a Page or props option for a url to its server-manifest key.
 * Resolvers may be async (UrlOpt supports Promise<string>) — a skipped await
 * would silently strip a route's css — and a props resolver may answer
 * undefined for a route without a loader.
 */
async function manifestKeyFor(
  resolver:
    | ResolvedUserOptions["Page"]
    | ResolvedUserOptions["props"]
    | string
    | undefined,
  url: string,
  manifest: ViteManifest,
): Promise<string | undefined> {
  let key: unknown;
  if (typeof resolver === "function") {
    try {
      key = await resolver(url);
    } catch {
      return undefined;
    }
  } else {
    key = resolver;
  }
  if (typeof key !== "string") return undefined;
  const normalized = key.replace(/^\.\//, "");
  return Object.keys(manifest).find(
    (k) => k === normalized || k.endsWith(`/${normalized}`),
  );
}

export interface RouteCssResolver {
  /** The browser build's output dir — where the css files themselves live. */
  staticDir: string;
  staticManifest: ViteManifest;
  serverManifest: ViteManifest;
  /**
   * The css files (paths relative to `staticDir`, as the static manifest
   * spells them) for the route `url` resolves to: the closure of its page
   * module, its props loader, and its layout chain (each layer's component
   * and props).
   */
  cssFor(url: string): Promise<string[]>;
}

export function createRouteCssResolver(opts: {
  userOptions: ResolvedUserOptions;
  projectRoot: string;
}): RouteCssResolver {
  const { userOptions, projectRoot } = opts;
  const outRoot = join(projectRoot, userOptions.build.outDir);
  const staticDir = join(outRoot, userOptions.build.static);
  const serverDir = join(outRoot, userOptions.build.server);
  const staticManifest = readViteManifest(staticDir);
  const serverManifest = readViteManifest(serverDir);
  return {
    staticDir,
    staticManifest,
    serverManifest,
    async cssFor(url) {
      // Layouts resolve from a separate module graph than the page
      // (layoutsResolver), so a layer's stylesheet only reaches this route's
      // css if its component and props are explicit roots — same as the SSG
      // pass. Layer paths are project-relative sources; manifestKeyFor maps
      // them onto the server manifest like page/props.
      const layers = userOptions.layoutsResolver?.(url) ?? [];
      const roots = (
        await Promise.all([
          manifestKeyFor(userOptions.Page, url, serverManifest),
          manifestKeyFor(userOptions.props, url, serverManifest),
          ...layers.flatMap((layer) => [
            manifestKeyFor(layer.component, url, serverManifest),
            manifestKeyFor(layer.props, url, serverManifest),
          ]),
        ])
      ).filter((k): k is string => typeof k === "string");
      const css = new Set<string>();
      for (const root of roots) {
        for (const f of cssClosure(serverManifest, staticManifest, root)) {
          css.add(f);
        }
      }
      return [...css];
    },
  };
}

/** `/about/` and `/about` name one route; `` names the root. */
export function normalizeRouteKey(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed === ""
    ? "/"
    : trimmed.startsWith("/")
      ? trimmed
      : `/${trimmed}`;
}
