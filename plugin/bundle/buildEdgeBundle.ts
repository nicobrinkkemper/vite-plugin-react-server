import { build as viteBuild, type Logger } from "vite";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import type { ResolvedUserOptions } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

/** Resolve a package subpath's `react-server` export target to an absolute path. */
function reactServerExportTarget(
  reactDir: string,
  subpath: string
): string | null {
  try {
    const pkg = JSON.parse(
      readFileSync(join(reactDir, "package.json"), "utf8")
    ) as { exports?: Record<string, unknown> };
    const entry = pkg.exports?.[subpath];
    const rel =
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object"
        ? (entry as Record<string, string>)["react-server"]
        : undefined;
    return rel ? join(reactDir, rel) : null;
  } catch {
    return null;
  }
}

/** Look up a source module's built output file in a Vite manifest. */
function manifestFileFor(
  manifest: Record<string, { file: string; src?: string }>,
  source: unknown
): string | null {
  if (typeof source !== "string") return null;
  if (manifest[source]?.file) return manifest[source].file;
  // Fallback: match by source basename (handles minor key normalization).
  const base = source.split("/").pop();
  const hit = Object.values(manifest).find((e) => e.src?.split("/").pop() === base);
  return hit?.file ?? null;
}

/**
 * Single-isolate edge bake (build.edge.singleIsolate). Generates a flight-
 * producer entry over the already-transformed server build (`dist/server`) and
 * bundles it into a single-isolate rsc bundle (`dist/server-edge`) with React
 * INLINED, so it runs on an edge runtime with no worker_threads and no runtime
 * `--conditions`.
 *
 * Two resolve.alias redirects do the work (alias redirects the PATH before
 * export-condition matching, so even the vendored CJS `require('react')` — which
 * ignores Vite's resolve.conditions — is caught):
 *   - the react-server subpaths ({@link DEFAULT_CONFIG.EDGE.reactServerSubpaths})
 *     → their `react-server` export targets (derived from react's own package
 *     `exports`), so the bundle bakes SERVER React without a process-level
 *     `--conditions react-server` (which would break the client render that runs
 *     in the same isolate).
 *   - the vendored `server.node` transport → `server.edge` (Web streams), so the
 *     edge bundle carries no `node:*` from the Node transport.
 *
 * Bundles through Vite's own `build()` — not a separate bundler — so it rides
 * Vite's internal transformer (esbuild today, Oxc/Rolldown later). The default
 * worker-based `dist/server` build is untouched; this is additive.
 */
export async function buildEdgeBundle(opts: {
  userOptions: ResolvedUserOptions;
  projectRoot: string;
  logger: Logger;
}): Promise<void> {
  const { userOptions, projectRoot, logger } = opts;
  if (!userOptions.build.edge.singleIsolate) return;

  const tag = "[build.edge]";
  const outRoot = join(projectRoot, userOptions.build.outDir);
  const serverDir = join(outRoot, userOptions.build.server);
  const edgeDir = join(
    outRoot,
    userOptions.build.edge.outDir ?? DEFAULT_CONFIG.BUILD.edge.outDir
  );

  if (!existsSync(serverDir)) {
    logger.warn(`${tag} server build dir not found at ${serverDir}; skipping`);
    return;
  }

  // Resolve the page + props built files from the server manifest.
  const manifestPath = join(serverDir, ".vite/manifest.json");
  if (!existsSync(manifestPath)) {
    logger.warn(`${tag} no server manifest at ${manifestPath}; skipping`);
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const pageFile = manifestFileFor(manifest, userOptions.Page);
  const propsFile = manifestFileFor(manifest, userOptions.props);
  if (!pageFile || !propsFile) {
    logger.warn(
      `${tag} could not resolve built Page/props from the manifest (Page=${String(
        userOptions.Page
      )}, props=${String(userOptions.props)}); skipping`
    );
    return;
  }

  // Resolve React's react-server entries + the vendored Web transport, relative
  // to the consumer project (the same react the build used).
  const projectRequire = createRequire(join(projectRoot, "package.json"));
  const reactDir = dirname(projectRequire.resolve("react/package.json"));
  const serverEdge = projectRequire.resolve("react-server-loader/server.edge");
  const serverNode = projectRequire.resolve("react-server-loader/server.node");

  const alias: Record<string, string> = { [serverNode]: serverEdge };
  for (const subpath of DEFAULT_CONFIG.EDGE.reactServerSubpaths) {
    const target = reactServerExportTarget(reactDir, subpath);
    if (!target) {
      logger.warn(
        `${tag} react has no 'react-server' export for "${subpath}"; skipping`
      );
      return;
    }
    // alias key: "." → "react", "./jsx-runtime" → "react/jsx-runtime"
    const key = subpath === "." ? "react" : `react/${subpath.slice(2)}`;
    alias[key] = target;
  }

  // Generate the flight-producer entry: (url) => Web ReadableStream Flight.
  // moduleBasePath "" mirrors renderRscReadableStream's default.
  const { entryFileName, flightExport } = DEFAULT_CONFIG.EDGE;
  const entryPath = join(serverDir, `.vprs-${entryFileName}`);
  const entrySource = `import { createElement } from "react";
import { renderToReadableStream } from ${JSON.stringify(serverEdge)};
import { Page } from ${JSON.stringify(join(serverDir, pageFile))};
import { props } from ${JSON.stringify(join(serverDir, propsFile))};

export function ${flightExport}(url) {
  return renderToReadableStream(createElement(Page, props(url)), "");
}
`;
  writeFileSync(entryPath, entrySource, "utf8");

  try {
    await viteBuild({
      root: serverDir,
      logLevel: "warn",
      configFile: false,
      resolve: { alias },
      ssr: { target: "node", noExternal: true },
      build: {
        ssr: true,
        outDir: edgeDir,
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
          input: { [entryFileName.replace(/\.js$/, "")]: entryPath },
          output: { preserveModules: false, format: "es" },
        },
      },
    });
    logger.info(`${tag} baked single-isolate rsc bundle → ${edgeDir}`);
  } finally {
    rmSync(entryPath, { force: true });
  }
}
