/**
 * Shared (condition-agnostic) types for createInlineFlightRenderer — the
 * react-server and react-client barrels both import these so the public surface
 * is identical across conditions.
 */
import type { CssContent } from "../types.js";

export interface InlineFlightRendererConfig {
  /** The document component (renders <html>…<div id="root">…). */
  Html: React.ComponentType<any>;
  /** Root layout rendered inside #root. Defaults to the vprs Root (Page + Css). */
  Root?: React.ComponentType<any>;
  /**
   * The `--ssr` client build dir (e.g. `dist/client`). The html-worker resolves
   * "use client" chunks from here: it externalizes react/react-dom as bare
   * specifiers, so they share the worker's React. Do NOT point this at the
   * browser bundle (e.g. `dist/static`) — those chunks bundle their own React
   * copy and SSR fails with a null hook dispatcher.
   */
  clientDir?: string;
  /** The static/browser build dir (manifest + assets). Defaults to `${buildDir}/static`. */
  staticDir?: string;
  /** Convenience: sets clientDir=`${buildDir}/client`, staticDir=`${buildDir}/static`. */
  buildDir?: string;
  /** Base URL / public path. Default: `process.env.BASE_URL || "/"`. */
  base?: string;
  /** Project root for the worker's module resolution (NODE_PATH). Default: cwd. */
  projectRoot?: string;
  /**
   * Explicit path to the html-worker entry. Defaults to the file shipped next to
   * this module (resolved from dist when imported as a package). Set it only for
   * non-standard installs, or when driving the renderer from source.
   */
  htmlWorkerPath?: string;
  /**
   * Client entry module(s) React must bootstrap so the hydrating <script> ships
   * in the SSR HTML. Default: derived from the static build manifest's entry.
   */
  bootstrapModules?: string[];
  verbose?: boolean;
}

export interface RenderRouteOptions {
  /** Route path, e.g. "/todos". */
  route: string;
  /** The page (server) component for this route. */
  Page: React.ComponentType<any>;
  /** Serializable props for the page (the live data). */
  props?: Record<string, unknown>;
  /** Per-route stylesheet links rendered inside #root (and inlined). */
  cssFiles?: Map<string, CssContent>;
  /** Global stylesheet links rendered into <head>. */
  globalCss?: Map<string, CssContent>;
  /** Stream id; defaults to the route. */
  id?: string;
}

export interface InlineFlightHtmlStream {
  pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => Writable;
  abort: (reason?: unknown) => void;
}

export interface InlineFlightRenderer {
  /** Render a route to an HTML stream with the matching flight inlined. */
  render(options: RenderRouteOptions): Promise<InlineFlightHtmlStream>;
  /** Terminate the underlying worker. */
  close(): Promise<void>;
}

export type CreateInlineFlightRendererFn = (
  config: InlineFlightRendererConfig
) => InlineFlightRenderer;
