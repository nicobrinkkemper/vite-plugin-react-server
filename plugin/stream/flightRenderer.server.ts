import {
  ReactDOMServer,
  ReactDOMServerWebpack,
  getVendoredRendererMode,
  getVendoredWebpackRendererMode,
} from "../vendor/vendor.server.js";
import { createPassthroughClientManifest } from "./webpackDevClientManifest.js";
import type { RendererMode } from "../vendor/lazyVendorModule.js";

/**
 * Pick the flight renderer for the configured transport — the ONE seam where
 * the two flavors differ on the server: esm's renderToPipeableStream takes
 * `(element, moduleBasePath, options)`, webpack's takes
 * `(element, clientManifest, options)`. Every server flight-render site
 * resolves through here so the swap can't drift between them.
 *
 * The returned `render` closes over the second argument: `moduleBasePath`
 * for esm (today's behavior, byte-for-byte), a pass-through dev manifest for
 * webpack (dev needs no sealing — ids resolve to their own Vite-served URLs;
 * see webpackDevClientManifest.ts). Accessing the renderer here also triggers
 * the lazy vendored load, so callers can run their element/renderer parity
 * check against `getLoadedMode()` right after, same as before.
 */
export function resolveFlightRenderer(options: {
  transport?: "esm" | "webpack";
  moduleBasePath?: string;
  moduleBaseURL?: string;
}): {
  render: (element: unknown, streamOptions: unknown) => any;
  getLoadedMode: () => RendererMode | null;
} {
  if (options.transport === "webpack") {
    const renderToPipeableStream = ReactDOMServerWebpack.renderToPipeableStream;
    const clientManifest = createPassthroughClientManifest(
      options.moduleBaseURL || "/"
    );
    return {
      render: (element, streamOptions) =>
        renderToPipeableStream(element, clientManifest, streamOptions as any),
      getLoadedMode: getVendoredWebpackRendererMode,
    };
  }
  const renderToPipeableStream = ReactDOMServer.renderToPipeableStream;
  // The esm renderer serializes each client reference as $$id minus this
  // prefix (resolveClientReferenceMetadata slices it off, and startsWith
  // guards the hosted root). Registration ids are canonically ROOTED, and the
  // browser composes a trailing-slash-stripped moduleBaseURL with the
  // serialized id — so the prefix must never consume the id's leading slash.
  // Hand the renderer the prefix without its trailing slash ("/" → "",
  // "/app/" → "/app"): every payload id then keeps its root, matching the
  // join contract on the other end of the wire.
  const hostedRoot = (options.moduleBasePath || "").replace(/\/+$/, "");
  return {
    render: (element, streamOptions) =>
      renderToPipeableStream(element as any, hostedRoot, streamOptions as any),
    getLoadedMode: getVendoredRendererMode,
  };
}
