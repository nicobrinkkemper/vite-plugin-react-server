import { createRequire } from "node:module";
import { join } from "node:path";
import { transportPkgDir } from "./transportDir.js";
import { createLazyVendorModule, reactPairedMode } from "./lazyVendorModule.js";
import { hasReactServerCondition } from "../config/getCondition.js";

// Load react-server-dom-esm/static from the vendored copy that ships inside
// the react-server-loader dependency. The vendored package.json exports map
// defaults to static.node.js.
//
// LAZY: deferred to first use so the dev/prod variant is picked from the
// settled NODE_ENV, not NODE_ENV-at-plugin-import. See lazyVendorModule.ts.
const vendorRequire = createRequire(join(transportPkgDir, "package.json"));

// Wrong-side imports must stay LOUD — see vendor.server.ts.
if (!hasReactServerCondition()) {
  vendorRequire("react-server-dom-esm/static");
}

const lazyStatic = createLazyVendorModule(
  () =>
    vendorRequire(
      "react-server-dom-esm/static"
    ) as typeof import("react-server-dom-esm/static.node"),
  reactPairedMode
);
const ReactDOMServer = lazyStatic.proxy;

/** dev/prod variant the vendored static renderer resolved to (null until first use). */
export const getVendoredRendererMode = lazyStatic.getLoadedMode;

// React still comes from the consumer's project. ALSO LAZY — its CJS entry
// branches on NODE_ENV like the renderer; the pair must resolve together
// (see vendor.server.ts).
const projectRoot = process.env["npm_config_local_prefix"] || process.cwd();
const projectRequire = createRequire(join(projectRoot, "package.json"));
const lazyReact = createLazyVendorModule(
  () => projectRequire("react") as typeof import("react"),
  reactPairedMode
);
const React = lazyReact.proxy;

export { ReactDOMServer, React };
