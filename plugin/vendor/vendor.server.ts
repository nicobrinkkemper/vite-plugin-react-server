import { workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import { join } from "node:path";
import { assertReactServer } from "../config/getCondition.js";

assertReactServer()

const projectRoot = workerData?.projectRoot || process.env["npm_config_local_prefix"] || process.cwd();
const nodeRequire = createRequire(join(projectRoot, "package.json"));

// Import ReactDOM from the project's node_modules
const ReactDOMServer = nodeRequire("react-server-dom-esm/server.node") as typeof import("react-server-dom-esm/server.node");
const React = nodeRequire("react") as typeof import("react");

export { ReactDOMServer, React };
