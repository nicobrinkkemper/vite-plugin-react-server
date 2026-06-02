/**
 * Node.js module resolution hook that redirects `react-server-dom-esm/*`
 * to the vendored copy at runtime. Used by the RSC worker via --import.
 * 
 * Server entries use ESM wrappers (in esm/) that re-export from CJS
 * so Node's ESM loader can provide named exports.
 */
import { register } from "node:module";
import { transportPkgDir as ossDir } from "./transportDir.js";

register("data:text/javascript," + encodeURIComponent(`
  const ossDir = ${JSON.stringify(ossDir)};
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  
  // Map bare specifiers to vendored files. Server entries use ESM wrappers
  // that re-export from CJS for proper named export support.
  const subpathMap = {
    "react-server-dom-esm":                join(ossDir, "index.js"),
    "react-server-dom-esm/client":         join(ossDir, "client.js"),
    "react-server-dom-esm/client.browser": join(ossDir, "esm", "react-server-dom-esm-client.browser.production.js"),
    "react-server-dom-esm/client.node":    join(ossDir, "client.node.js"),
    "react-server-dom-esm/server":         join(ossDir, "esm", "react-server-dom-esm-server.node.js"),
    "react-server-dom-esm/server.node":    join(ossDir, "esm", "react-server-dom-esm-server.node.js"),
    "react-server-dom-esm/static":         join(ossDir, "static.node.js"),
    "react-server-dom-esm/static.node":    join(ossDir, "static.node.js"),
  };

  export async function resolve(specifier, context, nextResolve) {
    if (specifier in subpathMap) {
      return {
        shortCircuit: true,
        url: pathToFileURL(subpathMap[specifier]).href,
      };
    }
    return nextResolve(specifier, context);
  }
`), import.meta.url);
