import { createRequire } from "node:module";
import { join } from "node:path";

const projectRoot = process.env["npm_config_local_prefix"] || process.cwd();
const nodeRequire = createRequire(join(projectRoot, "package.json"));

// Import ReactDOM from the project's node_modules for static pre-rendering
// This includes unstable_prerenderToNodeStream for build-time stream creation
const ReactDOMServer = nodeRequire("react-server-dom-esm/static.node") as typeof import("react-server-dom-esm/static.node");
const React = nodeRequire("react") as typeof import("react");

export { ReactDOMServer, React };
