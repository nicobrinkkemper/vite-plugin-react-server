import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, sep } from "node:path";
import type { Logger } from "vite";
import type { ResolvedUserOptions } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

/**
 * Emit `host-manifest.json` per host target (docs/internals/host-spec.md,
 * Resolution 1): one next to the Node/worker serving path's artifacts
 * (`dist/server`), one next to the baked pair (`dist/server-edge`) when the
 * bake emitted. Everything in it is information the build holds at emit
 * time; `createHost` derives serving from this contract instead of
 * directory spelunking, and a host reading a version it doesn't understand
 * fails loudly at startup rather than per-request.
 */

const HOST_MANIFEST_VERSION = 1;
const HOST_MANIFEST_FILENAME = "host-manifest.json";

type ViteManifest = Record<
  string,
  | {
      file?: string;
      css?: string[];
      imports?: string[];
      isEntry?: boolean;
    }
  | undefined
>;

/**
 * Transitive css for a page module. The page itself is a SERVER module, so
 * its import graph lives in the server manifest — but the css files ship
 * with the browser-facing chunks in the static manifest. Walk the server
 * graph from the page, and collect css for every visited source key from
 * whichever manifest carries it (client components appear in both).
 */
function cssClosure(
  graph: ViteManifest,
  cssSource: ViteManifest,
  key: string
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

/** Every file under `dir`, as /-separated paths relative to it. */
function walkFiles(dir: string): string[] {
  const out: string[] = [];
  const visit = (d: string) => {
    for (const name of readdirSync(d)) {
      const abs = join(d, name);
      if (statSync(abs).isDirectory()) visit(abs);
      else out.push(relative(dir, abs).split(sep).join("/"));
    }
  };
  if (existsSync(dir)) visit(dir);
  return out;
}

export function emitHostManifests(opts: {
  userOptions: ResolvedUserOptions;
  projectRoot: string;
  logger: Logger;
}): void {
  const { userOptions, projectRoot, logger } = opts;
  const outRoot = join(projectRoot, userOptions.build.outDir);
  const staticDir = join(outRoot, userOptions.build.static);
  const serverDir = join(outRoot, userOptions.build.server);
  const edgeDir = join(
    outRoot,
    userOptions.build.edge.outDir ?? DEFAULT_CONFIG.BUILD.edge.outDir
  );

  const htmlName = userOptions.build.htmlOutputPath ?? "index.html";

  const staticFiles = walkFiles(staticDir);

  // Prerendered urls derive from the emitted documents — the truth of what
  // the SSG (or the freeze) actually wrote, not what was merely requested.
  const prerendered = staticFiles
    .filter((f) => f === htmlName || f.endsWith(`/${htmlName}`))
    .map((f) => {
      const dir = f.slice(0, -htmlName.length).replace(/\/$/, "");
      return dir === "" ? "/" : `/${dir}`;
    })
    .sort();

  // Assets are the exact-match inventory a host serves as plain files: every
  // emitted static file that is not a prerendered document. The `.rsc`
  // snapshots stay IN the inventory — client navigation fetches them like
  // any asset.
  const assets = staticFiles
    .filter((f) => !(f === htmlName || f.endsWith(`/${htmlName}`)))
    .sort();

  // Weak etags per emitted file: content-hash now, so the host never hashes
  // at request time.
  const etags: Record<string, string> = {};
  for (const f of staticFiles) {
    const hash = createHash("sha1")
      .update(readFileSync(join(staticDir, f)))
      .digest("hex")
      .slice(0, 16);
    etags[f] = `W/"${hash}"`;
  }

  const routes = (userOptions.routePatterns ?? []).map((pattern: string) => ({
    pattern,
    dynamic: pattern.includes("$"),
  }));

  // Per-pattern css: resolve each pattern's page module, walk its server
  // graph, and collect css from the manifests (see cssClosure). This is what
  // retires the consumer-side collectManifestCss dance.
  const readManifest = (dir: string): ViteManifest => {
    const p = join(dir, ".vite/manifest.json");
    return existsSync(p)
      ? (JSON.parse(readFileSync(p, "utf8")) as ViteManifest)
      : {};
  };
  const staticManifest = readManifest(staticDir);
  const serverManifest = readManifest(serverDir);
  const cssByPattern: Record<string, string[]> = {};
  const pageFor = userOptions.Page;
  for (const { pattern } of routes) {
    let key: unknown;
    if (typeof pageFor === "function") {
      try {
        key = pageFor(pattern);
      } catch {
        key = undefined;
      }
    } else {
      key = pageFor;
    }
    // Async Page resolvers have no synchronous path here; their routes get
    // no cssByPattern entry rather than a wrong one.
    if (typeof key !== "string") continue;
    const normalized = key.replace(/^\.\//, "");
    const entryKey = Object.keys(serverManifest).find(
      (k) => k === normalized || k.endsWith(`/${normalized}`)
    );
    if (!entryKey) continue;
    const css = cssClosure(serverManifest, staticManifest, entryKey);
    if (css.length > 0) cssByPattern[pattern] = css;
  }

  const indexHtmlFile = staticManifest["index.html"]?.file;
  const base = userOptions.moduleBaseURL || "/";
  const bootstrapModules = indexHtmlFile
    ? [`${base.endsWith("/") ? base : `${base}/`}${indexHtmlFile}`]
    : [];

  const notFound = prerendered.includes("/404")
    ? `404/${htmlName}`
    : undefined;
  const errorPage = prerendered.includes("/500")
    ? `500/${htmlName}`
    : undefined;

  const common = {
    version: HOST_MANIFEST_VERSION,
    base,
    routes,
    prerendered,
    assets,
    cssByPattern,
    inlineThreshold: userOptions.css?.inlineThreshold,
    bootstrapModules,
    ...(notFound ? { notFoundPage: notFound } : {}),
    ...(errorPage ? { errorPage } : {}),
    etags,
    precompressed: [] as string[],
    transport: userOptions.transport ?? "esm",
  };

  const write = (dir: string, manifest: object) => {
    const path = join(dir, HOST_MANIFEST_FILENAME);
    writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
    logger.info(`[host-manifest] ${relative(projectRoot, path)}`);
  };

  if (existsSync(serverDir)) {
    // The node target's render-source fields (server request entry, worker
    // files) land with the createHost slice that consumes them; routing and
    // policy are complete here.
    write(serverDir, { ...common, target: "node" });
  }

  const producer = join(edgeDir, DEFAULT_CONFIG.EDGE.entryFileName);
  if (existsSync(producer)) {
    const consumer = join(edgeDir, "consumer.js");
    write(edgeDir, {
      ...common,
      target: "edge",
      renderBundle: `./${DEFAULT_CONFIG.EDGE.entryFileName}`,
      ...(existsSync(consumer) ? { consumerBundle: "./consumer.js" } : {}),
    });
  }
}
