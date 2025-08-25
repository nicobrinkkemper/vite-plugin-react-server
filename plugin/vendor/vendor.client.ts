import { createRequire } from "node:module";
import { join } from "node:path";
import { assertNonReactServer } from "../config/getCondition.js";

assertNonReactServer();

const projectRoot = process.cwd();
const nodeRequire = createRequire(join(projectRoot, "package.json"));

// Import ReactDOM from the project's node_modules
const ReactDOMServer = nodeRequire("react-dom/server") as typeof import("react-dom/server");
const ReactDOMClient = nodeRequire("react-server-dom-esm/client") as typeof import("react-server-dom-esm/client.node");
const React = nodeRequire("react") as typeof import("react");
   
export { ReactDOMServer, React, ReactDOMClient };