import { createRequire } from "node:module";
import { join } from "node:path";
import { transportPkgDir } from "./transportDir.js";
import { createLazyVendorModule, reactPairedMode } from "./lazyVendorModule.js";

// Edge counterpart of vendor.client.ts: the Web-streams CLIENT transport
// (react-server-dom-esm/client.browser — createFromReadableStream /
// createFromFetch), loaded from the vendored copy that ships inside
// react-server-loader. Decodes a Flight ReadableStream into React elements in a
// Web runtime (browser / workerd / Deno / Bun) — the consumer mirror of
// vendorEdge.server.ts. Condition-free: the client transport runs in the
// consumer's normal (client) React, so there is no wrong-side guard here.
//
// LAZY for the same NODE_ENV reason as vendor.client.ts: the vendored CJS picks
// its dev/prod variant at require time, so the require is deferred to first
// property access (by then build tooling has settled NODE_ENV). The React it
// binds to still comes from the consumer's project (see vendor.client.ts).
const vendorRequire = createRequire(join(transportPkgDir, "package.json"));

const lazyClientBrowser = createLazyVendorModule(
  () =>
    vendorRequire(
      "react-server-dom-esm/client.browser"
    ) as typeof import("react-server-dom-esm/client.browser"),
  reactPairedMode
);

const ReactDOMClientEdge = lazyClientBrowser.proxy;

export { ReactDOMClientEdge };
export type * from "react-server-dom-esm/client.browser";
