import { build as viteBuild, type Logger } from "vite";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import type { ResolvedUserOptions } from "../types.js";
import { patternProbeUrl } from "../router/matchRoute.js";
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
 * Single-isolate edge bake (build.edge, on by default). Generates a flight-
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
  if (!userOptions.build.edge.enabled) return;

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

  // Collect the built stylesheets so the document producer defaults `globalCss`
  // — the Html component renders them via <Css> as react-dom precedence-hoisted
  // <link>s in <head>. Without this the edge document render ships UNSTYLED (the
  // SSG scans CSS per page; the single-isolate edge render had no equivalent, so
  // consumers had to rebuild the CSS map by hand). The static manifest is the
  // canonical browser manifest — it includes HTML-entry CSS (e.g. a globals.css
  // the client entry imports) that the SSR client manifest omits. Hrefs are
  // root-absolute, matching how the built client assets are served.
  const bakedGlobalCss: Array<Record<string, string>> = [];
  // Prefix baked hrefs with the configured base so a non-root deploy
  // (base: "/app/") emits <link href="/app/assets/…">, not a root-absolute
  // "/assets/…" the browser can't find. Root base ("/") is the no-op default.
  const baseUrl = userOptions.moduleBaseURL ?? "/";
  const withBase = (css: string): string =>
    baseUrl === "/" ? "/" + css : baseUrl.replace(/\/$/, "") + "/" + css;
  const staticManifestPath = join(
    outRoot,
    userOptions.build.static,
    ".vite/manifest.json"
  );
  if (existsSync(staticManifestPath)) {
    const staticManifest = JSON.parse(readFileSync(staticManifestPath, "utf8"));
    const seen = new Set<string>();
    for (const entry of Object.values(
      staticManifest as Record<string, { css?: string[] } | undefined>
    )) {
      for (const css of entry?.css ?? []) {
        if (seen.has(css)) continue;
        seen.add(css);
        bakedGlobalCss.push({
          as: "link",
          rel: "stylesheet",
          href: withBase(css),
          id: css,
          precedence: "high",
        });
      }
    }
    if (bakedGlobalCss.length) {
      logger.info(
        `${tag} baking ${bakedGlobalCss.length} stylesheet(s) into the document producer's default globalCss`
      );
    }
  }

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

  // Resolve one route's Page/props to built modules and emit its baked
  // `{ key: { pagePath, propsPath, modules } }` line — shared by the enumerated
  // (exact-url) and dynamic (pattern) maps. Returns null when the built modules
  // can't be resolved.
  const routeEntryLine = (key: string, resolveUrl: string): string | null => {
    const pageSrc = routeSource(userOptions.Page, resolveUrl);
    const propsSrc = routeSource(userOptions.props, resolveUrl);
    const pageAbs = resolveBuilt(pageSrc);
    const propsAbs = resolveBuilt(propsSrc);
    if (
      typeof pageSrc !== "string" ||
      typeof propsSrc !== "string" ||
      !pageAbs ||
      !propsAbs
    ) {
      return null;
    }
    return `  ${JSON.stringify(key)}: { pagePath: ${JSON.stringify(
      pageSrc
    )}, propsPath: ${JSON.stringify(propsSrc)}, modules: { ${JSON.stringify(
      pageSrc
    )}: ${nsFor(pageAbs)}, ${JSON.stringify(propsSrc)}: ${nsFor(propsAbs)} } },`;
  };

  // Enumerated routes → exact-url map (the flash-free prerendered set).
  const routeLines: string[] = [];
  for (const url of urls ?? []) {
    const line = routeEntryLine(url, url);
    if (line) routeLines.push(line);
    else
      logger.warn(
        `${tag} could not resolve built Page/props for route ${url}; omitting`
      );
  }

  // Dynamic routes → pattern map: bake each route pattern's modules once
  // (identical for every concrete id) so the edge renders an UNENUMERATED url
  // (any `/profile/<id>`) by matching ROUTE_PATTERNS at request time, not only
  // the getStaticPaths-enumerated set. `patternProbeUrl` (passed the full
  // pattern list so a catch-all disambiguates from a named sibling) resolves
  // each pattern to its module via the same functional router the enumerated
  // pass uses.
  const patternRouteLines: string[] = [];
  for (const pattern of userOptions.routePatterns ?? []) {
    const line = routeEntryLine(pattern, patternProbeUrl(pattern, userOptions.routePatterns));
    if (line) patternRouteLines.push(line);
    else
      logger.warn(
        `${tag} could not resolve built Page/props for dynamic route ${pattern}; ` +
          `it will 404 at request time; omitting`
      );
  }

  // Skip only when NEITHER an enumerated nor a dynamic route resolved — a
  // fully-dynamic app (only `$` routes, no prerendered pages) still needs the
  // edge bundle to serve its per-request routes.
  if (routeLines.length === 0 && patternRouteLines.length === 0) {
    logger.warn(`${tag} no routes resolved from build.pages or routePatterns; skipping`);
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
  const { entryFileName, flightExport, documentExport, actionExport } =
    DEFAULT_CONFIG.EDGE;
  const pageExport = userOptions.pageExportName ?? "Page";
  const propsExport = userOptions.propsExportName ?? "props";
  const moduleBase = userOptions.moduleBase ?? "";
  const moduleBasePath = userOptions.moduleBasePath ?? "";
  const moduleBaseURL = userOptions.moduleBaseURL ?? "/";
  // resolvePageAndProps + createElementWithReact live beside this module in the
  // SAME installed vprs. createElementWithReact is the canonical composer the
  // static build uses — reusing it keeps the edge document tree byte-identical
  // (no hydration mismatch).
  const here = dirname(fileURLToPath(import.meta.url));
  const resolveHelper = join(here, "../helpers/resolvePageAndProps.js");
  const elementHelper = join(here, "../helpers/createElementWithReact.js");
  const actionHelper = join(here, "../helpers/handleServerAction.server.js");
  const gateHelper = join(here, "../references/createSealedServerReferenceGate.server.js");
  const matchRouteHelper = join(here, "../router/matchRoute.js");

  // Resolve the Html + Root components for the full-document flight. A configured
  // `Html`/`Root` string resolves to its built module (export named by
  // html/rootExportName); otherwise the bundled defaults. A functional
  // Html/Root (per-url) is uncommon here and falls back to the default with a
  // warning — document mode wants one document shell.
  const htmlExport = userOptions.htmlExportName ?? "Html";
  const rootExport = userOptions.rootExportName ?? "Root";
  const resolveComponent = (
    opt: unknown,
    exportName: string,
    defaultFile: string,
    defaultExport: string
  ): { abs: string; exportName: string } => {
    if (typeof opt === "string") {
      const abs = resolveBuilt(opt);
      if (abs) return { abs, exportName };
      logger.warn(`${tag} could not resolve built component "${opt}"; using default`);
    } else if (typeof opt === "function") {
      logger.warn(`${tag} functional Html/Root not supported in document mode; using default`);
    }
    return { abs: join(here, defaultFile), exportName: defaultExport };
  };
  const htmlComp = resolveComponent(userOptions.Html, htmlExport, "../components/html.js", "Html");
  const rootComp = resolveComponent(userOptions.Root, rootExport, "../components/root.js", "Root");

  const htmlNs = nsFor(htmlComp.abs);
  const rootNs = nsFor(rootComp.abs);

  // Enumerate server-action modules from the server manifest (the sealed-gate
  // allowlist): keys matching the action pattern, baked so the gate resolves
  // them without a disk import (and thus no `react-server` condition at runtime).
  const actionKeyRe = new RegExp(DEFAULT_CONFIG.EDGE.actionKeyPattern);
  const actionEntries: { key: string; file: string; ns: string }[] = [];
  for (const [key, entry] of Object.entries(
    manifest as Record<string, { file?: string } | undefined>
  )) {
    if (!entry?.file || !actionKeyRe.test(key)) continue;
    const abs = join(serverDir, entry.file);
    if (!existsSync(abs)) continue;
    actionEntries.push({ key, file: entry.file, ns: nsFor(abs) });
  }
  const actionDictLines = actionEntries.map(
    (a) => `  ${JSON.stringify(a.key)}: ${a.ns},`
  );
  const actionManifestLines = actionEntries.map(
    (a) => `  ${JSON.stringify(a.key)}: { file: ${JSON.stringify(a.file)} },`
  );
  if (actionEntries.length > 0) {
    logger.info(
      `${tag} baking server-action gate over ${actionEntries.length} module(s): ${actionEntries
        .map((a) => a.key)
        .join(", ")}`
    );
  }

  const entryPath = join(serverDir, `.vprs-${entryFileName}`);
  const entrySource = `import * as React from "react";
import { createElement } from "react";
import { renderToReadableStream } from ${JSON.stringify(serverEdge)};
import { resolvePageAndProps } from ${JSON.stringify(resolveHelper)};
import { matchRoutes } from ${JSON.stringify(matchRouteHelper)};
import { createElementWithReact } from ${JSON.stringify(elementHelper)};
import { handleServerActionRequest } from ${JSON.stringify(actionHelper)};
import { createSealedServerReferenceGate } from ${JSON.stringify(gateHelper)};
${importLines.join("\n")}

const PAGE_EXPORT = ${JSON.stringify(pageExport)};
const PROPS_EXPORT = ${JSON.stringify(propsExport)};
const MODULE_BASE = ${JSON.stringify(moduleBase)};
const MODULE_BASE_PATH = ${JSON.stringify(moduleBasePath)};
const MODULE_BASE_URL = ${JSON.stringify(moduleBaseURL)};
const ROUTE_PATTERNS = ${JSON.stringify(userOptions.routePatterns ?? [])};
// Built stylesheets, baked from the static manifest, so the document producer
// renders styled HTML on the edge with no per-app CSS wiring. Consumers can
// still override via opts.globalCss.
const BAKED_GLOBAL_CSS = ${JSON.stringify(bakedGlobalCss)};
const HtmlComponent = ${htmlNs}[${JSON.stringify(htmlComp.exportName)}];
const RootComponent = ${rootNs}[${JSON.stringify(rootComp.exportName)}];

const routes = {
${routeLines.join("\n")}
};

// Route patterns → baked modules, for rendering unenumerated dynamic urls.
const patternRoutes = {
${patternRouteLines.join("\n")}
};

/** Resolve a route's Page component + live props through the canonical helper. */
async function resolveRoute(url, request) {
  // Exact match for the enumerated/prerendered set; else fall back to matching
  // the url against the route patterns so any concrete dynamic url (e.g. a
  // /profile/<id> that wasn't prerendered) renders per-request on the edge.
  let route = routes[url];
  if (!route && ROUTE_PATTERNS.length) {
    const matched = matchRoutes(ROUTE_PATTERNS, url);
    if (matched) route = patternRoutes[matched.pattern];
  }
  if (!route) throw new Error("[edge] unknown route: " + url);
  const resolved = await resolvePageAndProps({
    pagePath: route.pagePath,
    propsPath: route.propsPath,
    pageExportName: PAGE_EXPORT,
    propsExportName: PROPS_EXPORT,
    moduleBaseURL: MODULE_BASE_URL,
    routePatterns: ROUTE_PATTERNS,
    // The in-flight request, so a loader can read cookies/headers to gate an
    // authenticated route. Present only for per-request edge renders (the
    // handler passes it); undefined at prerender.
    request,
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
  return resolved;
}

/** Headless page flight (Page only) — the simple producer. */
export async function ${flightExport}(url, request) {
  const resolved = await resolveRoute(url, request);
  return renderToReadableStream(
    createElement(resolved.PageComponent, resolved.pageProps),
    MODULE_BASE_PATH
  );
}

/**
 * Full-document flights for the flash-free inline-flight path: two flights from
 * the SAME live props (so markup and inline payload agree). \`full\` is the
 * Html/Root-wrapped document; \`headless\` is the Root-only #root contents the
 * client decodes from the inline payload. Pass live \`cssFiles\`/\`globalCss\`
 * (Map<string, CssContent>) so both carry the page styles.
 */
export async function ${documentExport}(url, opts = {}) {
  const resolved = await resolveRoute(url, opts.request);
  const base = {
    PageComponent: resolved.PageComponent,
    RootComponent,
    pageProps: resolved.pageProps,
    cssFiles: opts.cssFiles ?? new Map(),
    // Default to the built stylesheets (rendered in <head> via the Html
    // component's <Css>) so the edge document is styled out of the box.
    globalCss: opts.globalCss ?? BAKED_GLOBAL_CSS,
    moduleBase: MODULE_BASE,
    moduleBaseURL: MODULE_BASE_URL,
    moduleBasePath: MODULE_BASE_PATH,
    route: url,
    url,
    as: "div",
  };
  const full = renderToReadableStream(
    createElementWithReact(React, { ...base, HtmlComponent }),
    MODULE_BASE_PATH
  );
  const headless = renderToReadableStream(
    createElementWithReact(React, { ...base, HtmlComponent: React.Fragment }),
    MODULE_BASE_PATH
  );
  return { full, headless };
}

// Server-action modules baked into this bundle (server React inlined), keyed by
// their server-manifest key. The sealed gate loads from here instead of disk, so
// dispatching an action needs no \`react-server\` condition at runtime.
const ACTION_MODULES = {
${actionDictLines.join("\n")}
};
const ACTION_MANIFEST = {
${actionManifestLines.join("\n")}
};
const actionGate = createSealedServerReferenceGate({
  serverManifest: ACTION_MANIFEST,
  serverRoot: "",
  base: MODULE_BASE_URL,
  loadModule: async (key) => {
    const mod = ACTION_MODULES[key];
    if (!mod) throw new Error("[edge] no baked action module for: " + key);
    return mod;
  },
});

/**
 * Baked server-action handler: a sealed gate over the action modules above,
 * dispatched through the same trust boundary as the on-disk handler (CSRF /
 * body-cap guards, post-import server-reference check) — but with no disk import
 * and no \`react-server\` condition. \`(Request, { projectRoot? }) => Response\`.
 */
export async function ${actionExport}(request, opts = {}) {
  return handleServerActionRequest(request, {
    projectRoot: opts.projectRoot ?? "",
    base: MODULE_BASE_URL,
    resolveServerReference: (id) => actionGate.resolveServerReference(id),
    ...opts,
  });
}
`;
  writeFileSync(entryPath, entrySource, "utf8");

  try {
    await viteBuild({
      root: serverDir,
      logLevel: "warn",
      configFile: false,
      resolve: { alias },
      // Pin the edge bundle to the PRODUCTION React build. The vendored
      // react-server-dom-esm transport branches on process.env.NODE_ENV at
      // RUNTIME (the production build drops the flight-timeline debug chunks the
      // dev build emits), and Vite does NOT replace process.env for SSR builds —
      // so without this the edge server emits a DEV flight the production client
      // refuses to decode ("Failed to read a RSC payload created by a development
      // version of React on the server"), and hydrateOrRender silently falls back
      // to static (no hydration, links full-reload). The edge bundle is a
      // production deploy artifact paired with the production client, so bake the
      // mode in rather than depend on the runtime NODE_ENV of the edge process.
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      ssr: { target: "node", noExternal: true },
      build: {
        ssr: true,
        outDir: edgeDir,
        emptyOutDir: true,
        minify: userOptions.build.edge.minify,
        rollupOptions: {
          input: { [entryFileName.replace(/\.js$/, "")]: entryPath },
          output: { preserveModules: false, format: "es" },
        },
      },
    });
    logger.info(`${tag} baked single-isolate rsc bundle → ${edgeDir}`);
  } catch (error) {
    // The edge bundle is ADDITIVE and on by default — a bake failure must not
    // fail an otherwise-good build. Warn loudly and skip the artifact; the
    // worker-based dist/server build stands on its own. Opt out with
    // `build.edge: false` if the bake is not wanted.
    logger.warn(
      `${tag} skipped — edge bundle bake failed (the main build is unaffected; ` +
        `set build.edge:false to silence): ${
          error instanceof Error ? error.message : String(error)
        }`
    );
  } finally {
    rmSync(entryPath, { force: true });
  }
}
