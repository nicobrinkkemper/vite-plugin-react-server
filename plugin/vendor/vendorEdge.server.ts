import { createRequire } from "node:module";
import { join } from "node:path";
import { transportPkgDir } from "./transportDir.js";
import {
  createLazyVendorModule,
  reactPairedMode,
  vendoredTransportModeFromCache,
} from "./lazyVendorModule.js";
import { hasReactServerCondition } from "../config/getCondition.js";

// Edge counterpart of vendor.server.ts. Loads react-server-dom-esm/server.edge
// (Web-streams: renderToReadableStream / prerender) from the vendored copy that
// ships inside react-server-loader, for rendering RSC behind a Web
// `(Request) => Response` server (vprs createRequestHandler) or any
// workerd/Deno/Bun runtime.
//
// LAZY for the same reason as the node server: the vendored CJS branches on
// NODE_ENV at require time, so the require is deferred to first use. The React
// it binds to still comes from the consumer's project (see vendor.server.ts).
const vendorRequire = createRequire(join(transportPkgDir, "package.json"));

const lazyServerEdge = createLazyVendorModule(
  () =>
    vendorRequire(
      "react-server-dom-esm/server.edge"
    ) as typeof import("react-server-dom-esm/server.edge"),
  reactPairedMode,
  () => vendoredTransportModeFromCache("react-server-dom-esm-server.edge")
);
const ReactDOMServerEdge = lazyServerEdge.proxy;

// Wrong-side imports must stay LOUD, exactly like the node server module: the
// vendored edge server demands a react-server React, so probe through the lazy
// proxy at module init when the condition is absent.
if (!hasReactServerCondition()) {
  void (ReactDOMServerEdge as { renderToReadableStream?: unknown })
    .renderToReadableStream;
}

/** dev/prod variant the vendored edge renderer resolved to (null until first use). */
export const getVendoredEdgeRendererMode = lazyServerEdge.getLoadedMode;

export { ReactDOMServerEdge };
export type * from "react-server-dom-esm/server.edge";
