import { build as viteBuild, type Logger } from "vite";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import type { ResolvedUserOptions } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolveModuleFromManifest } from "../helpers/resolveModuleFromManifest.js";

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

  // Enumerate every prerendered route. Post-build, build.pages already lists
  // all URLs (the SSG just rendered them) and every page module is in
  // dist/server — so we CALL the (possibly functional) Page/props router for
  // each URL to map the route to its built module. No need to understand the
  // router: a closed enumeration over what the build already produced.
  const rawPages = userOptions.build.pages;
  const urls: string[] = Array.isArray(rawPages)
    ? rawPages
    : typeof rawPages === "function"
    ? await rawPages()
    : await rawPages;

  const routeSource = (opt: unknown, url: string): unknown =>
    typeof opt === "function" ? (opt as (u: string) => unknown)(url) : opt;

  // Map a source module to its built file via vprs's canonical manifest
  // resolver (the same one the RSC worker + build loaders use — honors the
  // normalizer and the moduleBase prefix), returning the absolute built path.
  const resolveBuilt = (src: unknown): string | null => {
    if (typeof src !== "string") return null;
    const { resolvedPath } = resolveModuleFromManifest({
      moduleId: src,
      normalizer: userOptions.normalizer,
      manifest,
      moduleBase: userOptions.moduleBase,
      preserveModulesRoot: userOptions.build.preserveModulesRoot,
      projectRoot,
      buildOutDir: userOptions.build.outDir,
      buildServerDir: userOptions.build.server,
      verbose: userOptions.verbose,
      logger,
    });
    return resolvedPath;
  };

  const routes: {
    url: string;
    pageSrc: string;
    pageAbs: string;
    propsSrc: string;
    propsAbs: string;
  }[] = [];
  for (const url of urls ?? []) {
    const pageSrc = routeSource(userOptions.Page, url);
    const propsSrc = routeSource(userOptions.props, url);
    const pageAbs = resolveBuilt(pageSrc);
    const propsAbs = resolveBuilt(propsSrc);
    if (
      typeof pageSrc === "string" &&
      typeof propsSrc === "string" &&
      pageAbs &&
      propsAbs
    ) {
      routes.push({ url, pageSrc, pageAbs, propsSrc, propsAbs });
    } else {
      logger.warn(`${tag} could not resolve built Page/props for route ${url}; omitting`);
    }
  }
  if (routes.length === 0) {
    logger.warn(`${tag} no routes resolved from build.pages; skipping`);
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

  // Generate a router-aware flight-producer entry. Rather than re-implement
  // props resolution, it routes through vprs's canonical resolvePageAndProps
  // (the same helper dev/SSG use — handles props-as-function/class/async, the
  // props-in-page-module fallback, the {url} default, errors), so the edge
  // render does not diverge. moduleBasePath/URL come from the user config (the
  // SSG used the same), so client-reference ids align with the ssr bundle the
  // runtime points moduleBaseURL at.
  const { entryFileName, flightExport } = DEFAULT_CONFIG.EDGE;
  const pageExport = userOptions.pageExportName ?? "Page";
  const propsExport = userOptions.propsExportName ?? "props";
  const moduleBasePath = userOptions.moduleBasePath ?? "";
  const moduleBaseURL = userOptions.moduleBaseURL ?? "/";
  // resolvePageAndProps lives beside this module in the SAME installed vprs.
  const resolveHelper = join(
    dirname(fileURLToPath(import.meta.url)),
    "../helpers/resolvePageAndProps.js"
  );

  // Static namespace imports of each built module, deduped by file. The loader
  // resolvePageAndProps calls is a dictionary lookup over these — a closed
  // manifest, no runtime import().
  const importLines: string[] = [];
  const idByFile = new Map<string, string>();
  const nsFor = (absPath: string): string => {
    let id = idByFile.get(absPath);
    if (!id) {
      id = `M${idByFile.size}`;
      idByFile.set(absPath, id);
      importLines.push(`import * as ${id} from ${JSON.stringify(absPath)};`);
    }
    return id;
  };
  const routeLines = routes.map((r) => {
    const pageNs = nsFor(r.pageAbs);
    const propsNs = nsFor(r.propsAbs);
    return `  ${JSON.stringify(r.url)}: { pagePath: ${JSON.stringify(
      r.pageSrc
    )}, propsPath: ${JSON.stringify(r.propsSrc)}, modules: { ${JSON.stringify(
      r.pageSrc
    )}: ${pageNs}, ${JSON.stringify(r.propsSrc)}: ${propsNs} } },`;
  });

  const entryPath = join(serverDir, `.vprs-${entryFileName}`);
  const entrySource = `import { createElement } from "react";
import { renderToReadableStream } from ${JSON.stringify(serverEdge)};
import { resolvePageAndProps } from ${JSON.stringify(resolveHelper)};
${importLines.join("\n")}

const PAGE_EXPORT = ${JSON.stringify(pageExport)};
const PROPS_EXPORT = ${JSON.stringify(propsExport)};
const MODULE_BASE_PATH = ${JSON.stringify(moduleBasePath)};
const MODULE_BASE_URL = ${JSON.stringify(moduleBaseURL)};

const routes = {
${routeLines.join("\n")}
};

export async function ${flightExport}(url) {
  const route = routes[url];
  if (!route) throw new Error("[edge] unknown route: " + url);
  const resolved = await resolvePageAndProps({
    pagePath: route.pagePath,
    propsPath: route.propsPath,
    pageExportName: PAGE_EXPORT,
    propsExportName: PROPS_EXPORT,
    moduleBaseURL: MODULE_BASE_URL,
    url,
    loader: async (id) => {
      // resolvePage/resolveProps may pass "<path>#<export>"; key by the path.
      const path = String(id).split("#")[0];
      const mod = route.modules[path];
      if (!mod) throw new Error("[edge] no baked module for id: " + id);
      return mod;
    },
  });
  if (resolved.type !== "success") {
    throw resolved.error ?? new Error("[edge] failed to resolve route: " + url);
  }
  return renderToReadableStream(
    createElement(resolved.PageComponent, resolved.pageProps),
    MODULE_BASE_PATH
  );
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
