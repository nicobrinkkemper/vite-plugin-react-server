import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

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

// Load react-server-dom-esm/static from vendored copy
// The vendored package.json exports map defaults to static.node.js
const vendorRequire = createRequire(join(ossDir, "react-server-dom-esm", "package.json"));
const ReactDOMServer = vendorRequire("react-server-dom-esm/static") as typeof import("react-server-dom-esm/static.node");

// React still comes from the consumer's project
const projectRoot = process.env["npm_config_local_prefix"] || process.cwd();
const projectRequire = createRequire(join(projectRoot, "package.json"));
const React = projectRequire("react") as typeof import("react");

export { ReactDOMServer, React };
