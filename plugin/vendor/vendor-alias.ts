import type { Plugin } from "vite";
import { join } from "node:path";
import { lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { transportPkgDir, transportRoot } from "./transportDir.js";
import { getNodeEnv } from "../config/getNodeEnv.js";

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

    config(config, _env) {
      const pkg = transportPkgDir;
      // Pick the dev/prod variant of the browser client from the SAME unified
      // `mode` that `resolveUserConfig` uses for the React build define — never
      // from `env.mode` alone.
      //
      // `env.mode` (configEnv.mode) is pre-populated with the command default
      // ("production" for `vite build`, "development" for serve), so it cannot
      // distinguish explicit user intent. Under `NODE_ENV=development vite
      // build` it would be "production" and this alias would pull the
      // PRODUCTION rsdom browser client even though React itself and the dev
      // `.rsc` are development — yielding the runtime error "Failed to read a
      // RSC payload created by a development version of React on the server
      // while using a production version on the client."
      //
      // Mirror resolveUserConfig's rule: an explicit `config.mode` (set only
      // when the user passes `--mode <m>` or authors `mode` in their config)
      // wins; otherwise mirror NODE_ENV (normalized by getNodeEnv). This keeps
      // the rsdom browser client's dev/prod choice locked to the same mode that
      // selects the dev-vs-prod React build.
      const explicitMode =
        typeof config.mode === "string" && config.mode !== ""
          ? config.mode
          : undefined;
      const mode = explicitMode ?? getNodeEnv();
      const isProd = mode === "production";

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
        if (!config.server.fs.allow.includes(transportRoot)) {
          config.server.fs.allow.push(transportRoot);
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

      // Server/static entries: mark external under the BARE canonical
      // specifier, so the emitted artifact carries
      // `import ... from "react-server-dom-esm/server.node"` — no
      // machine-absolute path binding dist to the build machine (it used to
      // stamp /home/<user>/.../react-server-loader/vendor/... into every
      // client-reference proxy). Resolution at runtime is already provided
      // for every consumer of dist/server: plain Node resolves through the
      // node_modules/react-server-dom-esm symlink this plugin maintains
      // (ensureVendoredPackageLinked — the vendored dir is a complete package
      // with its own exports map), and the RSC worker's loader hook maps the
      // bare ids directly.
      //
      // Two spellings deliberately NOT used: the resolved absolute path (the
      // machine binding), and bare `react-server-loader/*` — dist can host a
      // PARTIAL rsl copy under its own node_modules (the node_modules-shipped
      // client-reference feature), and that shadow intercepts bare rsl
      // resolution with an incomplete package. `react-server-dom-esm` is
      // never hosted, so it has no shadow.
      if (isServerEntry(source)) {
        return { id: canonicalTransportSpecifier(source), external: true };
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
  const pkg = transportPkgDir;
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
      // No existing file — create symlink. Vite 8's dev module runner resolves
      // bare specifiers (e.g. `react-server-dom-esm/server`) via Node, not the
      // plugin `resolveId` external path Vite 6 used, so the symlink must
      // actually exist. Ensure the parent `node_modules` dir is present first;
      // a freshly-scaffolded project root may not have one yet.
      mkdirSync(dirname(target), { recursive: true });
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
  if (file) return join(transportPkgDir, file);
  const subpath = source.replace("react-server-dom-esm", "");
  return join(transportPkgDir, subpath || "index.js");
}

/**
 * The canonical bare form of a transport specifier — the vendored file's name
 * minus `.js`, under the package name (`react-server-dom-esm/server` and
 * `/server.node` both canonicalize to `react-server-dom-esm/server.node`).
 * Derived from the same subpathMap as the vendored resolution so the two can
 * never disagree; the vendored package.json exports every one of these.
 */
function canonicalTransportSpecifier(source: string): string {
  const file = subpathMap[source];
  if (file) return `react-server-dom-esm/${file.replace(/\.js$/, "")}`;
  return source;
}
