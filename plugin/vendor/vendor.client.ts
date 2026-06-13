import { createRequire } from "node:module";
import { join } from "node:path";
import { transportPkgDir } from "./transportDir.js";
import { createLazyVendorModule, reactPairedMode } from "./lazyVendorModule.js";
import { hasReactServerCondition } from "../config/getCondition.js";

// Vendored react-server-dom-esm/client.node + the consumer's react-dom/server
// and react, exposed as LAZY proxies (mirrors vendor.server.ts). These CJS
// modules pick their dev/prod variant from NODE_ENV at require time, so the
// require is deferred to first property access — by then build tooling (vite
// build, test harnesses) has settled NODE_ENV. A module-scope require would
// instead load react-dom + react during config eval (this file is reachable
// from the plugin's import graph), pinning React's variant before NODE_ENV is
// final. See lazyVendorModule.ts.
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

// Wrong-side guard (mirrors vendor.server.ts). This is the client/SSR renderer
// side; react-dom/server is banned under the react-server condition, so
// evaluating this module there must throw at module init. Consumers depend on
// that: createHtmlStream.client and the stream-imports test expect importing a
// client renderer under react-server to reject. Forcing the proxy here makes
// the require run (and throw) only on the wrong side; on the correct side the
// proxy stays untouched, so React still loads lazily.
if (hasReactServerCondition()) {
  void (ReactDOMServer as { renderToPipeableStream?: unknown })
    .renderToPipeableStream;
}

export { ReactDOMServer, React, ReactDOMClient };
export type React = typeof import("react");
