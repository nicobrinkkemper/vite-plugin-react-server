import { createRequire } from "node:module";
import { join } from "node:path";
import { transportPkgDir } from "./transportDir.js";
import { createLazyVendorModule, reactPairedMode } from "./lazyVendorModule.js";
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

// Wrong-side imports must stay LOUD: evaluating this module in a process
// WITHOUT the react-server condition throws at module init, exactly like the
// old eager require did (the vendored server demands a react-server react).
// The lazy path below only applies where this module legitimately runs.
if (!hasReactServerCondition()) {
  vendorRequire("react-server-dom-esm/server");
}

const lazyServer = createLazyVendorModule(
  () =>
    vendorRequire(
      "react-server-dom-esm/server"
    ) as typeof import("react-server-dom-esm/server.node"),
  reactPairedMode
);
const ReactDOMServer = lazyServer.proxy;

/** dev/prod variant the vendored RSC renderer resolved to (null until first use). */
export const getVendoredRendererMode = lazyServer.getLoadedMode;

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
