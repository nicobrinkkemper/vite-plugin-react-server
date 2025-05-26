import { workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import { join } from "node:path";

const projectRoot = workerData?.projectRoot || process.env["npm_config_local_prefix"] || process.cwd();
const nodeRequire = createRequire(join(projectRoot, "package.json"));

// Import ReactDOM from the project's node_modules
const ReactDOMServer = nodeRequire("react-server-dom-esm/server.node");
const React = nodeRequire("react");

export { ReactDOMServer, React };
