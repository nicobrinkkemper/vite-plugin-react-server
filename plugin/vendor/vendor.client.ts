import { createRequire } from "node:module";
import { join } from "node:path";
import { transportPkgDir } from "./transportDir.js";
import { createLazyVendorModule, reactPairedMode } from "./lazyVendorModule.js";
import { hasReactServerCondition } from "../config/getCondition.js";

// Vendored react-server-dom-esm/client.node + the consumer's react-dom/server
// and react. All LAZY (mirrors vendor.server.ts): these CJS modules pick their
// dev/prod variant from NODE_ENV at require time, so the require must be
// deferred to first use — after build tooling (vite build, test harnesses) has
// settled NODE_ENV, not at plugin-import time. A module-scope require here used
// to load react-dom + react into the client plugin-import graph during config
// eval, caching React's variant before NODE_ENV settled.
// See lazyVendorModule.ts.
const vendorRequire = createRequire(join(transportPkgDir, "package.json"));
const lazyClient = createLazyVendorModule(
  () =>
    vendorRequire(
      join(transportPkgDir, "client.node.js")
    ) as typeof import("react-server-dom-esm/client.node"),
  reactPairedMode
);
const ReactDOMClient = lazyClient.proxy;

// React and react-dom still come from the consumer's project, also lazy so the
// react/react-dom/renderer trio all resolve from one settled NODE_ENV.
const projectRoot = process.env["npm_config_local_prefix"] || process.cwd();
const projectRequire = createRequire(join(projectRoot, "package.json"));
const lazyReactDOMServer = createLazyVendorModule(
  () => projectRequire("react-dom/server") as typeof import("react-dom/server"),
  reactPairedMode
);
const ReactDOMServer = lazyReactDOMServer.proxy;
const lazyReact = createLazyVendorModule(
  () => projectRequire("react") as typeof import("react"),
  reactPairedMode
);
const React = lazyReact.proxy;

// Wrong-side imports must stay LOUD (mirrors vendor.server.ts): this is the
// client/SSR renderer side, so evaluating it UNDER the react-server condition
// must throw at module init exactly like the old eager require did —
// react-dom/server is banned under react-server, and code paths
// (createHtmlStream.client) plus the stream-imports test rely on that import
// rejecting. The probe goes THROUGH the lazy proxy so the require still loads
// lazily on the correct (client) side, keeping React out of the client
// plugin-import graph.
if (hasReactServerCondition()) {
  void (ReactDOMServer as { renderToPipeableStream?: unknown })
    .renderToPipeableStream;
}

export { ReactDOMServer, React, ReactDOMClient };
export type React = typeof import("react");
