import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { assertNonReactServer } from "../config/getCondition.js";

assertNonReactServer();

const __dirname = dirname(fileURLToPath(import.meta.url));
function findPkgRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "oss-experimental", "react-server-dom-esm"))) return dir;
    dir = dirname(dir);
  }
  return dirname(dirname(__dirname));
}
const ossDir = join(findPkgRoot(), "oss-experimental");

// Resolve react-server-dom-esm from our vendored copy
const vendorRequire = createRequire(join(ossDir, "react-server-dom-esm", "package.json"));
const ReactDOMClient = vendorRequire("react-server-dom-esm/client.node") as typeof import("react-server-dom-esm/client.node");

// React and react-dom still come from the consumer's project
const projectRoot = process.env["npm_config_local_prefix"] || process.cwd();
const projectRequire = createRequire(join(projectRoot, "package.json"));
const ReactDOMServer = projectRequire("react-dom/server") as typeof import("react-dom/server");
const React = projectRequire("react") as typeof import("react");

export { ReactDOMServer, React, ReactDOMClient };
