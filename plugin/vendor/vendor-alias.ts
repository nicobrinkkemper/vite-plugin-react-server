import type { Plugin } from "vite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// Find package root by walking up from current file until we find oss-experimental/
// Works from both plugin/vendor/ (source) and dist/plugin/vendor/ (built)
const __dirname = dirname(fileURLToPath(import.meta.url));
function findPkgRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "oss-experimental", "react-server-dom-esm"))) return dir;
    dir = dirname(dir);
  }
  return dirname(dirname(__dirname)); // fallback
}
const pkgRoot = findPkgRoot();
const ossDir = join(pkgRoot, "oss-experimental");

/**
 * Vite plugin that aliases `react-server-dom-esm/*` imports to the vendored
 * copy shipped with this plugin. This eliminates the need for consumers to
 * install `react-server-dom-esm` separately or use patch-package.
 *
 * Browser client entries use true ESM files for Rollup tree-shaking.
 * Server/static entries are marked external during builds — they're CJS
 * modules loaded at runtime via createRequire in vendor.*.ts files.
 */
export function vitePluginVendorAlias(): Plugin {
  let isBuild = false;

  return {
    name: "vite-plugin-react-server:vendor-alias",
    enforce: "pre",

    config(_config, env) {
      const pkg = join(ossDir, "react-server-dom-esm");
      const isProd = env.mode === "production";
      
      // Only alias browser client to ESM for Rollup tree-shaking.
      // Server/static are handled by resolveId with external:true.
      return {
        resolve: {
          alias: [
            { 
              find: "react-server-dom-esm/client.browser", 
              replacement: join(pkg, "esm", isProd 
                ? "react-server-dom-esm-client.browser.production.js" 
                : "react-server-dom-esm-client.browser.development.js") 
            },
          ],
        },
      };
    },

    configResolved(config) {
      isBuild = config.command === "build";
    },

    resolveId(source) {
      // Only handle react-server-dom-esm specifiers (not already aliased paths)
      if (!source.startsWith("react-server-dom-esm")) {
        return;
      }

      // Skip client.browser — handled by config alias above
      if (source === "react-server-dom-esm/client.browser") {
        return;
      }

      // For server/static entries during build: mark external with resolved path.
      // At runtime, vendor.*.ts uses createRequire to load from this path.
      if (isBuild && isServerEntry(source)) {
        const resolved = resolveVendored(source);
        return { id: resolved, external: true };
      }

      // For all other entries (client.node, client, index), resolve to vendored path
      return resolveVendored(source);
    },
  };
}

function isServerEntry(source: string): boolean {
  return (
    source.includes("/server") ||
    source.includes("/static")
  );
}

// Explicit subpath → file mapping. Server entries always resolve to .node
// variants to bypass the react-server condition guard in server.js.
const subpathMap: Record<string, string> = {
  "react-server-dom-esm":                "index.js",
  "react-server-dom-esm/client":         "client.js",
  "react-server-dom-esm/client.browser": "client.browser.js",
  "react-server-dom-esm/client.node":    "client.node.js",
  "react-server-dom-esm/server":         "server.node.js",
  "react-server-dom-esm/server.node":    "server.node.js",
  "react-server-dom-esm/static":         "static.node.js",
  "react-server-dom-esm/static.node":    "static.node.js",
};

function resolveVendored(source: string): string {
  const file = subpathMap[source];
  if (file) {
    return join(ossDir, "react-server-dom-esm", file);
  }
  // Fallback for unknown subpaths
  const subpath = source.replace("react-server-dom-esm", "");
  return join(ossDir, "react-server-dom-esm", subpath || "index.js");
}
