import { createRequire } from "node:module";
import { join } from "node:path";
import { transportPkgDir } from "./transportDir.js";

// Load react-server-dom-esm/client.node directly from the vendored copy that
// ships inside the react-server-loader dependency.
const vendorRequire = createRequire(join(transportPkgDir, "package.json"));
const ReactDOMClient = vendorRequire(join(transportPkgDir, "client.node.js")) as typeof import("react-server-dom-esm/client.node");

// React and react-dom still come from the consumer's project
const projectRoot = process.env["npm_config_local_prefix"] || process.cwd();
const projectRequire = createRequire(join(projectRoot, "package.json"));
const ReactDOMServer = projectRequire("react-dom/server") as typeof import("react-dom/server");
const React = projectRequire("react") as typeof import("react");

export { ReactDOMServer, React, ReactDOMClient };
