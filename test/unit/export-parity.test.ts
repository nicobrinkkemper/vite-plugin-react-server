/**
 * Regression: a public subpath that is meant to expose the SAME API under both
 * the `react-server` and the browser/default condition must not silently drop
 * (or gain) exports in one of them.
 *
 * This is the class of bug that hid `createReactFetcher` (and callServer /
 * createCallServer) from `vite-plugin-react-server/utils` under the
 * `react-server` condition: the two condition targets had different export
 * surfaces, so a client module importing from `/utils` built fine in one
 * environment and failed in the other.
 *
 * NOTE: not every condition-split export belongs here. Many (`.`, the plugin,
 * react-static, the dev-server entries) are genuinely different server/client
 * implementations — and some client variants aren't even importable outside a
 * browser. Only list a subpath in SYMMETRIC_SUBPATHS once it's confirmed to be
 * a same-API-different-impl export, where divergent *names* are a real bug.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf-8")
) as { exports: Record<string, any> };

// Public subpaths whose export-name surface must match across conditions.
const SYMMETRIC_SUBPATHS = ["./utils"];

const runtimeNames = (mod: Record<string, unknown>): string[] =>
  Object.keys(mod)
    .filter((name) => name !== "default")
    .sort();

const importTarget = (relTarget: string) =>
  import(pathToFileURL(resolve(root, relTarget)).href) as Promise<
    Record<string, unknown>
  >;

describe("export-surface parity across conditions", () => {
  for (const sub of SYMMETRIC_SUBPATHS) {
    it(`${sub} exposes the same names under react-server and browser/default`, async () => {
      const entry = pkg.exports[sub];
      const serverTarget: string | undefined = entry?.["react-server"];
      const browserTarget: string | undefined = entry?.browser ?? entry?.default;
      expect(serverTarget, `${sub} has a react-server target`).toBeTruthy();
      expect(browserTarget, `${sub} has a browser/default target`).toBeTruthy();

      const [server, browser] = await Promise.all([
        importTarget(serverTarget!),
        importTarget(browserTarget!),
      ]);

      // Different impls are fine; different export NAMES break a consumer that
      // imports the subpath under the other condition.
      expect(runtimeNames(server)).toEqual(runtimeNames(browser));
    });
  }

  it("/utils exposes the RSC-client helpers under the react-server condition", async () => {
    const serverTarget: string = pkg.exports["./utils"]["react-server"];
    const mod = await importTarget(serverTarget);
    for (const name of [
      "createReactFetcher",
      "callServer",
      "createCallServer",
      "useRscHmr",
    ]) {
      expect(mod, `${name} missing from /utils under react-server`).toHaveProperty(
        name
      );
    }
  });
});


// ---------------------------------------------------------------------------
// STATIC parity: every condition-split subpath, without evaluating anything.
//
// The runtime check above is stronger where it applies (it also proves the
// module EVALUATES under both conditions), but most condition-split targets
// can't be naively imported — a .client barrel under react-server crashes.
// Export NAMES don't need evaluation.
//
// SOURCE is parsed, not dist: the vite-built and tsc-built dist flavors have
// different re-export shapes (the prepack trap), so a dist-parsing guard
// flip-flops with whichever build ran last. plugin/**/*.ts is the invariant
// truth. Type-only exports are excluded — they have no runtime surface.
//
// Every condition-split subpath in the exports map must be classified below —
// a new one failing the "classified" test is the point: decide whether its
// surface is symmetric or intentionally different, then list it.
// ---------------------------------------------------------------------------
import ts from "typescript";
import { existsSync } from "node:fs";

/** dist target ("./dist/plugin/x.js") → source file ("plugin/x.ts[x]"). */
function distToSource(distTarget: string): string {
  const rel = distTarget.replace(/^\.\/dist\//, "").replace(/\.js$/, "");
  for (const ext of [".ts", ".tsx"]) {
    const candidate = resolve(root, rel + ext);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`no source found for dist target ${distTarget}`);
}

/** Resolve a re-export specifier from `from` to a source file, or null for bare. */
function resolveSpecifier(spec: string, from: string): string | null {
  if (spec.startsWith("#")) {
    // The package's own subpath-imports map (#env): both sides list dist
    // targets; map back to source. Parity is per-side, but the guard follows
    // the DEFAULT entry — the browser/default split inside #env is an
    // environment shim with an identical surface by construction (itself
    // enforced below via the "./env" subpath classification).
    const entry = (pkg as unknown as { imports?: Record<string, unknown> })
      .imports?.[spec];
    const target =
      typeof entry === "string"
        ? entry
        : (entry as Record<string, string> | undefined)?.default;
    if (!target) throw new Error(`imports map has no target for ${spec}`);
    return distToSource(target);
  }
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec.replace(/\.js$/, ""));
  for (const ext of [".ts", ".tsx"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  throw new Error(`no source found for "${spec}" from ${from}`);
}

/** Runtime export names of a source module, following re-export chains. */
function sourceExportNames(file: string, visited = new Set<string>()): Set<string> {
  if (visited.has(file)) return new Set();
  visited.add(file);
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const names = new Set<string>();
  const addBinding = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) names.add(name.text);
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
      for (const el of name.elements) {
        if (ts.isBindingElement(el)) addBinding(el.name);
      }
  };
  const isExported = (node: ts.HasModifiers): boolean =>
    !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const node of sf.statements) {
    if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly) continue; // no runtime surface
      const target = node.moduleSpecifier
        ? resolveSpecifier(
            (node.moduleSpecifier as ts.StringLiteral).text,
            file
          )
        : null;
      if (node.moduleSpecifier && target === null) {
        throw new Error(
          `export from bare specifier in ${file}: ${(node.moduleSpecifier as ts.StringLiteral).text}`
        );
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const spec of node.exportClause.elements) {
          if (!spec.isTypeOnly) names.add(spec.name.text);
        }
      } else if (node.exportClause && ts.isNamespaceExport(node.exportClause)) {
        names.add(node.exportClause.name.text); // export * as ns from …
      } else if (target) {
        for (const n of sourceExportNames(target, visited)) {
          if (n !== "default") names.add(n);
        }
      }
    } else if (ts.isExportAssignment(node)) {
      if (!node.isExportEquals) names.add("default");
    } else if (ts.isVariableStatement(node)) {
      if (isExported(node))
        for (const decl of node.declarationList.declarations) addBinding(decl.name);
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)
    ) {
      if (isExported(node)) {
        const hasDefault = ts
          .getModifiers(node)
          ?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
        if (hasDefault) names.add("default");
        else if (node.name && ts.isIdentifier(node.name)) names.add(node.name.text);
      }
    }
    // interfaces/type aliases: type-only, no runtime surface — skipped.
  }
  return names;
}

const pickTarget = (v: unknown): string | undefined =>
  typeof v === "string" ? v : (v as Record<string, string> | undefined)?.default;

/** All condition-split subpaths in the exports map, with their two targets. */
function conditionSplitSubpaths(): Array<{ sub: string; server: string; browser: string }> {
  const out: Array<{ sub: string; server: string; browser: string }> = [];
  for (const [sub, entry] of Object.entries(pkg.exports)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const server = pickTarget(e["react-server"]);
    const browser = pickTarget(e.browser ?? e.default);
    if (server && browser && server !== browser) out.push({ sub, server, browser });
  }
  return out;
}

/** Subpaths whose two condition targets must expose IDENTICAL runtime names. */
// "." is deliberately absent: since the de-split it has ONE target for both
// conditions, so there is no pair to compare.
const STATIC_SYMMETRIC = [
  "./utils",
  "./env",
  "./env/plugin",
  "./plugin",
  "./config/createHandlerOptions",
  "./dev-server/configureReactServer",
  "./dev-server/handleServerAction",
  "./helpers/resolveStreamElements",
  "./orchestrator",
  "./orchestrator/createPluginOrchestrator",
  "./react-client",
  "./react-client/plugin",
  "./react-server",
  "./react-server/plugin",
  "./react-static/createBuildLoader",
  "./react-static/plugin",
  "./react-static/renderPage",
  "./react-static/rscToHtmlStream",
  "./stream/createHtmlStream",
  "./stream/createRenderToPipeableStreamHandler",
  "./stream/createRscStream",
  "./stream/handleRscStream",
  "./transformer",
  "./transformer/plugin",
] as const;

/**
 * Subpaths whose surfaces are INTENTIONALLY different per condition — the
 * recorded per-side-only names are the intent. A change here must be a
 * conscious edit: a name growing on one side only is exactly the bug class
 * this guard exists for, unless it's deliberate and recorded.
 */
const STATIC_ASYMMETRIC: Record<string, { serverOnly: string[]; browserOnly: string[] }> = {
  "./stream": {
    serverOnly: [
      "RSC_CONTENT_TYPE",
      "createHtmlStreamWithInlineFlight",
      "renderRscReadableStream",
      "renderRscResponse",
    ],
    browserOnly: [
      "createEdgeHandler",
      "createFromFetch",
      "createFromNodeStream",
      "createFromReadableStream",
      "renderFlightToHtml",
    ],
  },
  "./config": {
    serverOnly: ["createHandlerOptionsServer"],
    browserOnly: ["createHandlerOptionsClient"],
  },
  "./vendor": {
    serverOnly: [
      "ReactDOMServerWebpack",
      "getVendoredRendererMode",
      "getVendoredWebpackRendererMode",
    ],
    browserOnly: ["ReactDOMClient", "ReactDOMHtmlServerEdge"],
  },
  "./helpers": {
    serverOnly: [
      "createRequestHandler",
      "handleServerActionRequest",
      "toNodeListener",
    ],
    browserOnly: ["delegateServerActionToWorker", "resolveComponentsClient"],
  },
  "./dev-server": {
    serverOnly: [],
    browserOnly: ["cleanupServerAction", "configureRequestHandler"],
  },
  "./helpers/handleServerAction": {
    serverOnly: [
      "handleServerActionRequest",
      "resolveAndExecuteServerAction",
      // The flight-codec resolver imports the transport pair, which only a
      // react-server process can hold; the client side delegates to the
      // rsc-worker instead.
      "resolveActionFlightCodec",
    ],
    browserOnly: [
      "delegateServerActionToWorker",
      // The worker delegates' shared outcome writer: maps the terminal
      // outcomes onto the HTTP response in the non-react-server process; the
      // server side answers outcomes inside its own handlers instead.
      "writeServerActionOutcome",
    ],
  },
  "./react-static": {
    serverOnly: ["collectHtmlContent"],
    browserOnly: [],
  },
  "./react-static/temporaryReferences": {
    serverOnly: ["createLazyTemporaryReferenceSet"],
    browserOnly: [],
  },
};

describe("static export parity (all condition-split subpaths, source-parsed)", () => {
  const splits = conditionSplitSubpaths();

  it("every condition-split subpath is classified symmetric or intentionally asymmetric", () => {
    const classified = new Set<string>([
      ...STATIC_SYMMETRIC,
      ...Object.keys(STATIC_ASYMMETRIC),
    ]);
    const unclassified = splits.map((s) => s.sub).filter((sub) => !classified.has(sub));
    expect(
      unclassified,
      "new condition-split subpath(s) — decide: same surface (STATIC_SYMMETRIC) or deliberately different (STATIC_ASYMMETRIC)?"
    ).toEqual([]);
  });

  it("classified subpaths all still exist in the exports map", () => {
    const present = new Set(splits.map((s) => s.sub));
    const stale = [...STATIC_SYMMETRIC, ...Object.keys(STATIC_ASYMMETRIC)].filter(
      (sub) => !present.has(sub)
    );
    expect(stale, "classification lists a subpath the exports map no longer splits").toEqual([]);
  });

  for (const sub of STATIC_SYMMETRIC) {
    it(`${sub}: identical export names under both conditions`, () => {
      const split = splits.find((s) => s.sub === sub);
      if (!split) return; // covered by the staleness test above
      const server = sourceExportNames(distToSource(split.server));
      const browser = sourceExportNames(distToSource(split.browser));
      expect([...server].sort()).toEqual([...browser].sort());
    });
  }

  for (const [sub, expected] of Object.entries(STATIC_ASYMMETRIC)) {
    it(`${sub}: divergence matches the recorded intent`, () => {
      const split = splits.find((s) => s.sub === sub);
      if (!split) return; // covered by the staleness test above
      const server = sourceExportNames(distToSource(split.server));
      const browser = sourceExportNames(distToSource(split.browser));
      const serverOnly = [...server].filter((n) => !browser.has(n)).sort();
      const browserOnly = [...browser].filter((n) => !server.has(n)).sort();
      expect({ serverOnly, browserOnly }).toEqual({
        serverOnly: [...expected.serverOnly].sort(),
        browserOnly: [...expected.browserOnly].sort(),
      });
    });
  }
});
