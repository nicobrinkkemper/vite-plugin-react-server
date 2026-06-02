import { createRequire } from "node:module";
import { join } from "node:path";
import { transportPkgDir } from "./transportDir.js";

// Load react-server-dom-esm/static from the vendored copy that ships inside
// the react-server-loader dependency. The vendored package.json exports map
// defaults to static.node.js.
const vendorRequire = createRequire(join(transportPkgDir, "package.json"));
const ReactDOMServer = vendorRequire("react-server-dom-esm/static") as typeof import("react-server-dom-esm/static.node");

// React still comes from the consumer's project
const projectRoot = process.env["npm_config_local_prefix"] || process.cwd();
const projectRequire = createRequire(join(projectRoot, "package.json"));
const React = projectRequire("react") as typeof import("react");

export { ReactDOMServer, React };
