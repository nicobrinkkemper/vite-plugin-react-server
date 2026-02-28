import type { Plugin } from "vite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, lstatSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";

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
 * Server/static entries are CJS and must be loadable via native Node import()
 * (not eval'd as ESM by Vite's module runner, which lacks require()).
 *
 * In dev mode, we ensure the vendored package is reachable from node_modules
 * so Vite's module runner can externalize and natively import() CJS entries.
 */
export function vitePluginVendorAlias(): Plugin {
  return {
    name: "vite-plugin-react-server:vendor-alias",
    enforce: "pre",

    config(_config, env) {
      const pkg = join(ossDir, "react-server-dom-esm");
      const isProd = env.mode === "production";

      return {
        resolve: {
          alias: [
            // Browser client → ESM for Rollup tree-shaking
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
      // Allow serving vendored files when the plugin is linked or in a monorepo.
      // Must be done in configResolved to append to the resolved allow list
      // (setting in config hook can override Vite's defaults).
      if (config.command === "serve" && config.server?.fs?.allow) {
        if (!config.server.fs.allow.includes(pkgRoot)) {
          config.server.fs.allow.push(pkgRoot);
        }
      }

      // Ensure vendored package is reachable via Node resolution in ALL Vite
      // contexts (dev server, vitest, SSR workers, custom scripts).
      // Vite's module runner resolves bare imports via Node — not plugin hooks —
      // so the package must be in node_modules for CJS entries to work.
      ensureVendoredPackageLinked(config.root);
    },

    resolveId(source) {
      if (!source.startsWith("react-server-dom-esm")) return;
      if (source === "react-server-dom-esm/client.browser") return;

      // Server/static entries: mark external so the runner/bundler uses native
      // import() rather than eval(). The resolved path points into the vendored
      // copy (reachable via symlink in dev, directly in build).
      if (isServerEntry(source)) {
        return { id: resolveVendored(source), external: true };
      }

      return resolveVendored(source);
    },
  };
}

/**
 * Ensure `node_modules/react-server-dom-esm` links to the vendored copy.
 * Only creates a symlink if no real install exists. Safe to call multiple times.
 */
function ensureVendoredPackageLinked(root?: string): void {
  const pkg = join(ossDir, "react-server-dom-esm");
  const target = join(root ?? process.cwd(), "node_modules", "react-server-dom-esm");
  try {
    const stat = (() => { try { return lstatSync(target); } catch { return null; } })();
    if (stat?.isSymbolicLink()) {
      // Update symlink if it points elsewhere
      if (readlinkSync(target) !== pkg) {
        unlinkSync(target);
        symlinkSync(pkg, target, "junction");
      }
    } else if (!stat) {
      // No existing file — create symlink
      symlinkSync(pkg, target, "junction");
    }
    // If a real directory/file exists (user installed it), leave it alone
  } catch {
    // Non-fatal: symlink creation can fail on some systems
  }
}

function isServerEntry(source: string): boolean {
  return source.includes("/server") || source.includes("/static");
}

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
  if (file) return join(ossDir, "react-server-dom-esm", file);
  const subpath = source.replace("react-server-dom-esm", "");
  return join(ossDir, "react-server-dom-esm", subpath || "index.js");
}
