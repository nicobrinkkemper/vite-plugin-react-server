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

/**
 * The decode counterpart of {@link resolveFlightRenderer}: the ONE seam where
 * the two transports' `decodeReply` arities differ. esm takes
 * `(body, moduleBasePath)`; webpack takes `(body, serverManifest?)` — the
 * manifest resolves server references INSIDE the reply (an action passed back
 * as an argument), which the built-in handlers don't carry, so plain values,
 * FormData, and File decode and a server-reference argument is the transport's
 * own error, not a silent mis-parse.
 *
 * `body` is what the browser's `encodeReply` produced: a string, or a
 * multipart `FormData`.
 */
export function resolveFlightReplyDecoder(options: {
  transport?: "esm" | "webpack";
  moduleBasePath?: string;
}): {
  decodeReply: (body: string | FormData) => Promise<unknown[]>;
} {
  if (options.transport === "webpack") {
    const decodeReply = ReactDOMServerWebpack.decodeReply;
    return {
      decodeReply: (body) => Promise.resolve(decodeReply(body) as unknown[]),
    };
  }
  const decodeReply = ReactDOMServer.decodeReply;
  const moduleBasePath = options.moduleBasePath ?? "/";
  return {
    decodeReply: async (body) =>
      (await decodeReply(body as never, moduleBasePath)) as unknown[],
  };
}
