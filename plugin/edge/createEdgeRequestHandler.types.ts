import type { CreateEdgeHandlerOptions } from "../stream/createEdgeHandler.types.js";
import type { CssContent } from "../types.js";

/**
 * The public surface of a baked edge bundle (`dist/server-edge/render.js`) — the
 * shape {@link createEdgeRequestHandler} consumes.
 *
 * Import the bundle as a namespace and hand it over whole:
 *
 * ```js
 * import * as bundle from "../dist/server-edge/render.js";
 * export const handler = createEdgeRequestHandler(bundle);
 * ```
 *
 * A STATIC import on purpose. The alternative — passing a path and letting the
 * handler `import()` it — is invisible to the bundlers and file tracers that
 * decide what a deploy actually ships, so the module goes missing at runtime on
 * exactly the platforms this handler exists to serve.
 */
export type EdgeBundleExports = {
  /** `renderRouteToDocument`: the full-document producer (`{ full, headless }`). */
  renderRouteToDocument: (
    url: string,
    opts?: {
      request?: Request;
      cssFiles?: Map<string, CssContent>;
      globalCss?: unknown;
    }
  ) => Promise<{
    full: ReadableStream<Uint8Array>;
    headless: ReadableStream<Uint8Array>;
  }>;
  /**
   * `handleRouteAction`: the baked sealed action gate. Present whenever the build
   * found `"use server"` modules; a read-only site has none.
   */
  handleRouteAction?: (
    request: Request,
    opts?: { projectRoot?: string }
  ) => Promise<Response>;
  /** `bootstrapModules`: the content-hashed browser entry, baked at build time. */
  bootstrapModules?: string[];
  /** `clientModuleBaseURL`: the built client bundle, resolved from import.meta.url. */
  clientModuleBaseURL?: string;
  /**
   * `clientManifest`: the webpack-shaped client manifest (hosted
   * client-reference id -> `{ id, chunks, name }`), derived from the client
   * build's Vite manifest at bake time. The module map for rendering this
   * build's flight through the webpack transport
   * (`react-server-loader/webpack/*`) — closed-registry resolution for a
   * fully self-contained deployment.
   */
  clientManifest?: Record<string, { id: string; chunks: string[]; name: string }>;
  /**
   * `flightTransport`: which RSC transport the bundle was baked with
   * (`build.edge.transport`). The handlers pick their decode side from this,
   * so a bundle and its server cannot disagree. Absent on pre-transport-flag
   * bundles — treated as `"esm"`.
   */
  flightTransport?: "esm" | "webpack";
  /**
   * `inlineFlight`: the build's resolved delivery mode (`build.inlineFlight`),
   * baked so `"stream"` reaches the document handler without the consumer
   * re-stating it. Absent on pre-mode bundles — treated as the buffered
   * `"blob"` default.
   */
  inlineFlight?: false | "blob" | "stream";
};

/**
 * Options for {@link createEdgeRequestHandler} / {@link createEdgeRenderHook}.
 *
 * Extends {@link CreateEdgeHandlerOptions} minus its producer fields: the bundle
 * IS the producer, so `render`/`renderDocument` are not yours to set. Everything
 * the bundle bakes (`bootstrapModules`, `moduleBaseURL`) is inherited from it and
 * only needs setting to override.
 */
export type CreateEdgeRequestHandlerOptions = Omit<
  CreateEdgeHandlerOptions,
  "render" | "renderDocument"
> & {
  /**
   * Which routes render live, per request. A predicate, or a list of urls and/or
   * route patterns (`/blog/$slug`) matched with the router's own `matchRoutes`.
   *
   * This is a SERVING-layer choice, deliberately separate from `Page`/`props`
   * (which define the page surface): the same build can be served fully static,
   * fully dynamic, or a mix, without rebuilding.
   *
   * Omit to render every route the bundle baked — the right default for a deploy
   * with no prerendered snapshots to fall back to.
   */
  dynamic?: string[] | ((url: string) => boolean);
  /** Forwarded to the baked action gate (which ignores it — nothing loads from disk). */
  projectRoot?: string;
  /** Header marking a POST as a server action. @default "x-rsc-action" */
  actionHeader?: string;
  /**
   * Filename the client router fetches a route's flight from.
   * @default "index.rsc"
   */
  rscOutputPath?: string;
};

/**
 * A dynamic-route renderer for
 * {@link import("../helpers/createRequestHandler.server.js").createRequestHandler}'s
 * `render` hook: returns a `Response` for a route this bundle renders, or `null`
 * to fall through to whatever the caller serves next (a prerendered file, an
 * asset, a 404).
 */
export type EdgeRenderHook = (
  route: string,
  request: Request
) => Promise<Response | null>;
