import { createRequire } from "node:module";
import { join } from "node:path";
import { transportPkgDir, transportRoot } from "./transportDir.js";
import {
  createLazyVendorModule,
  reactPairedMode,
  vendoredTransportModeFromCache,
} from "./lazyVendorModule.js";
import { hasReactServerCondition } from "../config/getCondition.js";

// Load react-server-dom-esm/server from the vendored copy that ships inside
// the react-server-loader dependency. The vendored package.json exports map
// defaults to server.node.js.
//
// LAZY: the vendored CJS picks its dev/prod renderer from NODE_ENV at require
// time, so the require is deferred to first use — NODE_ENV must be sampled
// after build tooling (vite build, test harnesses) has settled it, not at
// plugin-import time. See lazyVendorModule.ts.
const vendorRequire = createRequire(join(transportPkgDir, "package.json"));

const lazyServer = createLazyVendorModule(
  () =>
    vendorRequire(
      "react-server-dom-esm/server"
    ) as typeof import("react-server-dom-esm/server.node"),
  reactPairedMode,
  // ground truth: which variant file actually evaluated (the CJS cache may
  // already hold the other one — getLoadedMode must report reality)
  () => vendoredTransportModeFromCache("react-server-dom-esm-server.node")
);
const ReactDOMServer = lazyServer.proxy;

// Wrong-side imports must stay LOUD: evaluating this module in a process
// WITHOUT the react-server condition throws at module init, exactly like the
// old eager require did (the vendored server demands a react-server react).
// The eager probe goes THROUGH the lazy module so its mode bookkeeping stays
// truthful even when the condition heuristic is wrong and the require
// unexpectedly succeeds.
if (!hasReactServerCondition()) {
  void (ReactDOMServer as { renderToPipeableStream?: unknown })
    .renderToPipeableStream;
}

/** dev/prod variant the vendored RSC renderer resolved to (null until first use). */
export const getVendoredRendererMode = lazyServer.getLoadedMode;

// The webpack-flavored server renderer, for transport:"webpack". Same lazy
// discipline as the esm module above (the vendored CJS branches on NODE_ENV
// at require time). Resolved through react-server-loader's own exports map
// ("./webpack/server" → the vendored react-server-dom-webpack server.node),
// via a require anchored at the rsl package so self-name resolution works
// whether rsl is a real install, hoisted, or symlinked. Its
// renderToPipeableStream takes (element, clientManifest, options) — a client
// manifest where the esm renderer takes moduleBasePath.
const rslRequire = createRequire(join(transportRoot, "package.json"));

const lazyWebpackServer = createLazyVendorModule(
  () =>
    rslRequire("react-server-loader/webpack/server") as WebpackServerModule,
  reactPairedMode,
  () => vendoredTransportModeFromCache("react-server-dom-webpack-server.node")
);

type WebpackServerModule = {
  renderToPipeableStream: (
    element: unknown,
    clientManifest: unknown,
    options?: unknown
  ) => { pipe: <T>(destination: T) => T; abort: (reason?: unknown) => void };
  registerClientReference: (...args: unknown[]) => unknown;
  registerServerReference: (...args: unknown[]) => unknown;
  decodeReply: (...args: unknown[]) => unknown;
  decodeAction: (...args: unknown[]) => unknown;
};

export const ReactDOMServerWebpack = lazyWebpackServer.proxy;

/** dev/prod variant the webpack renderer resolved to (null until first use). */
export const getVendoredWebpackRendererMode = lazyWebpackServer.getLoadedMode;

// React still comes from the consumer's project. ALSO LAZY: under
// --conditions react-server the consumer react's CJS entry branches on
// NODE_ENV too, and its dev createElement consults the dispatcher installed
// by the renderer — a dev react paired with a prod renderer dies with
// "dispatcher.getOwner is not a function". Deferring both keeps the pair
// resolving from the same settled NODE_ENV.
const projectRoot = process.env["npm_config_local_prefix"] || process.cwd();
const projectRequire = createRequire(join(projectRoot, "package.json"));
const lazyReact = createLazyVendorModule(
  () => projectRequire("react") as typeof import("react"),
  reactPairedMode
);
const React = lazyReact.proxy;

export { ReactDOMServer, React };
export type * from "react-server-dom-esm/server.node";
export type React = typeof import("react");
