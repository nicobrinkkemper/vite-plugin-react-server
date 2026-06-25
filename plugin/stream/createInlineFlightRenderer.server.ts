/**
 * createInlineFlightRenderer.server.ts
 *
 * High-level helper for serving a DYNAMIC route (per-request, live data) as a
 * flash-free HTML document: the page is rendered to HTML and the matching flight
 * payload is inlined, so the browser hydrates the server markup in place — live
 * data in the initial HTML, no empty-shell flash, no index.rsc round-trip. It is
 * the runtime counterpart to the build's inlineFlightPayload, and collapses the
 * worker + dual-flight + manifest boilerplate a consumer would otherwise hand-roll
 * (see the bidoof-template /todos server).
 *
 * CONDITION: this is the `react-server` serving path — RSC is rendered in-process
 * and HTML in an html-worker (react-client). It is exported under the react-server
 * condition only; the react-client serving counterpart (RSC in a worker, HTML in
 * the main thread) is a separate, less common model — see createInlineFlightRenderer.client.ts.
 *
 * The two flights come from the SAME components and props via the canonical
 * `createElementWithReact` composition (through createRscStream):
 *  - FULL:     <Html Root Page .../>  → the whole document, streamed to the worker.
 *  - HEADLESS: <Root as={Fragment} Page cssFiles/>  → page content only (Page + Css,
 *              no #root wrapper) — exactly what the client renders into #root.
 * Same Root + same props ⇒ the markup and the inline payload agree (clean hydrate).
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { Readable } from "node:stream";
import { React } from "../vendor/vendor.server.js";
import { assertReactServer, REACT_CONDITION } from "../config/getCondition.js";
import { createRenderToPipeableStreamHandler } from "./createRenderToPipeableStreamHandler.server.js";
import { createHtmlStreamWithInlineFlight } from "./createHtmlStreamWithInlineFlight.server.js";
import { createWorker } from "../worker/createWorker.js";
import { Root as DefaultRoot } from "../components/root.js";
import type {
  CreateInlineFlightRendererFn,
} from "./createInlineFlightRenderer.types.js";

export type {
  InlineFlightRendererConfig,
  RenderRouteOptions,
  InlineFlightRenderer,
  InlineFlightHtmlStream,
  CreateInlineFlightRendererFn,
} from "./createInlineFlightRenderer.types.js";

assertReactServer();

/** Read the build manifest's entry module as a bootstrap module URL. */
function deriveBootstrapModules(staticDir: string, base: string): string[] {
  try {
    const manifest = JSON.parse(
      readFileSync(join(staticDir, ".vite/manifest.json"), "utf-8")
    ) as Record<string, { file: string; isEntry?: boolean }>;
    const entry =
      manifest["index.html"]?.file ??
      Object.values(manifest).find((e) => e.isEntry)?.file;
    return entry ? [base + entry] : [];
  } catch {
    return [];
  }
}

/** Buffer an RSC flight stream to its raw bytes (the inline payload). */
async function collectFlight(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export const createInlineFlightRenderer: CreateInlineFlightRendererFn = function _createInlineFlightRenderer(
  config
) {
  const {
    Html,
    Root = DefaultRoot,
    buildDir,
    base = process.env["BASE_URL"] || "/",
    verbose = false,
  } = config;
  const clientDir = config.clientDir ?? (buildDir ? join(buildDir, "client") : undefined);
  const staticDir = config.staticDir ?? (buildDir ? join(buildDir, "static") : undefined);
  if (!clientDir) {
    throw new Error(
      "createInlineFlightRenderer: clientDir (or buildDir) is required — the html-worker resolves 'use client' chunks from the --ssr client build."
    );
  }
  const projectRoot = config.projectRoot ?? process.cwd();
  const bootstrapModules =
    config.bootstrapModules ??
    (staticDir ? deriveBootstrapModules(staticDir, base) : []);

  // One long-lived html-worker, created on first render and reused. createWorker
  // flips the condition (react-server → react-client) and now defaults the
  // startup timeout, so a minimal userOptions is enough.
  let workerPromise: Promise<any> | null = null;
  const getWorker = (): Promise<any> => {
    if (!workerPromise) {
      workerPromise = createWorker({
        projectRoot,
        ...(config.htmlWorkerPath ? { workerPath: config.htmlWorkerPath } : {}),
        currentCondition: REACT_CONDITION.server,
        reverseCondition: REACT_CONDITION.client,
        mode: "production",
        verbose,
        workerData: {
          // The worker reads only clientPipeableStreamOptions / panicThreshold /
          // logLevel; everything else flows per-render via the INIT message. The
          // SerializedUserOptions type wants the full set, hence the cast.
          userOptions: { verbose, clientPipeableStreamOptions: {} } as any,
          resolvedConfig: { logLevel: verbose ? "info" : "warn" } as any,
        },
      }).then((result: any) => {
        if (result.type !== "success") {
          workerPromise = null;
          throw result.error ?? new Error("html-worker failed to start");
        }
        return result.worker;
      });
    }
    return workerPromise;
  };

  return {
    async render({ route, Page, props = {}, cssFiles, globalCss, id }) {
      const htmlWorker = await getWorker();
      // createRenderToPipeableStreamHandler renders directly from components via
      // createElementWithReact (no pagePath needed). Its option type requires the
      // full handler-option set even though only these fields matter here, so we
      // cast — components compose exactly as the build does.
      const common = {
        route,
        PageComponent: Page,
        RootComponent: Root,
        pageProps: props,
        cssFiles,
        globalCss,
        moduleBaseURL: base,
        moduleBasePath: "/",
        as: "div",
        verbose,
      };

      // FULL document flight (Html-wrapped) → the html-worker renders it to HTML.
      const full = createRenderToPipeableStreamHandler({
        ...common,
        id: `${id ?? route}-full`,
        HtmlComponent: Html,
      } as any);

      // HEADLESS flight (Root with as=Fragment → Page + Css, no #root wrapper):
      // the payload the client decodes into #root. Same Root + props as FULL.
      const headless = createRenderToPipeableStreamHandler({
        ...common,
        id: `${id ?? route}-headless`,
        HtmlComponent: React.Fragment,
      } as any);

      return createHtmlStreamWithInlineFlight({
        route,
        id: id ?? route,
        htmlWorker,
        rscStream: full.rscStream,
        inlineFlight: collectFlight(headless.rscStream as Readable),
        moduleRootPath: clientDir,
        moduleBaseURL: base,
        moduleBasePath: "/",
        projectRoot: clientDir,
        clientPipeableStreamOptions: { bootstrapModules },
        verbose,
      } as Parameters<typeof createHtmlStreamWithInlineFlight>[0]);
    },

    async close() {
      if (!workerPromise) return;
      try {
        const worker = await workerPromise;
        await worker?.terminate?.();
      } catch {
        /* already gone */
      } finally {
        workerPromise = null;
      }
    },
  };
}
