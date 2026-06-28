import type { ConfigEnv } from "vite";
import { transformWithEsbuild } from "vite";
import { readFile } from "node:fs/promises";
import type { Program } from "acorn";
import { resolveOptions } from "../config/resolveOptions.js";
import { createDefaultModuleID } from "../config/createModuleID.js";
import { analyzeModule } from "react-server-loader/directives";
// Version-independent acorn parse: the bundler's `this.parse` is Oxc on Vite 8
// (different AST shape) but Rollup/acorn on 6/7. rsl's parser matches the
// JS-only Rollup behavior we already relied on here.
import { parse as rslParse } from "react-server-loader";
import type { VitePluginFn } from "../types.js";

// Virtual id prefix for the client-side server-reference proxy. The real
// `.server` module path is encoded after the prefix.
const PREFIX = "\0vprs-server-ref:";
const SERVER_SUFFIX = /\.server\.[tj]sx?$/;

/**
 * Client-imported server functions, the dev-correct way.
 *
 * When a `"use client"` component imports a `"use server"` module, the browser
 * needs a `createServerReference` proxy — not the server code. Emitting that
 * proxy AS the `.server` module's transform output fails in dev: a browser-
 * served `.server` module bypasses client import-analysis, so the proxy's
 * transport import (`react-server-dom-esm/client.browser`) reaches the browser
 * as an unresolved bare specifier.
 *
 * Instead, in the client/SSR environments we REDIRECT the import to a virtual
 * client module (`\0vprs-server-ref:<path>`) and emit the proxy there. A virtual
 * module IS import-analyzed like any client module, so its transport import
 * resolves to the dev-optimized URL. The `.server` module itself is only ever
 * loaded in the server environment (its real functions, registerServerReference).
 *
 * The hosted id baked into each `createServerReference(...)` is the module's
 * `moduleID` — identical to what the server registers — so the action POST
 * resolves through the existing endpoint / gate. The SSR environment gets a
 * render-safe stub (the function is an event handler, never called during
 * render; and the browser transport can't init under Node SSG).
 */
export const serverReferenceClientPlugin: VitePluginFn = (userOptions) => {
  const resolved = resolveOptions(userOptions);
  let moduleID: ((path: string, source: string, isClient: boolean) => string) | undefined =
    resolved.type === "success" ? resolved.userOptions.loader?.moduleID : undefined;
  let normalizer = (resolved.type === "success"
    ? resolved.userOptions.normalizer
    : undefined) as ((p: string) => [unknown, string]) | undefined;
  let viteBase = "/";

  return {
    name: "vite-plugin-react-server:server-reference-client",
    enforce: "pre",
    configResolved(config) {
      viteBase = config.base ?? "/";
      // Recreate moduleID with the runtime configEnv/mode, mirroring
      // createTransformerPlugin, so the hosted id matches the server side.
      const r = resolveOptions(
        { ...userOptions, loader: { ...userOptions.loader, mode: config.mode } },
        true
      );
      if (r.type === "success") {
        normalizer = r.userOptions.normalizer as typeof normalizer;
        if (r.userOptions.loader) {
          const env: ConfigEnv = {
            command: config.command,
            mode: config.mode,
            isSsrBuild: Boolean(config.build.ssr),
            isPreview: false,
          };
          r.userOptions.loader.moduleID = createDefaultModuleID(
            r.userOptions,
            env,
            config.mode as "development" | "production" | "test"
          );
          moduleID = r.userOptions.loader.moduleID;
        }
      }
    },

    async resolveId(source, importer) {
      const env = this.environment?.name;
      if (env !== "client" && env !== "ssr") return null;
      if (source.startsWith(PREFIX)) return source; // already ours
      const clean = source.split("?")[0];
      if (!SERVER_SUFFIX.test(clean)) return null;
      const real = await this.resolve(source, importer, { skipSelf: true });
      if (!real || real.external) return null;
      return PREFIX + real.id;
    },

    async load(id) {
      if (!id.startsWith(PREFIX)) return null;
      const realPath = id.slice(PREFIX.length).split("?")[0];
      const src = await readFile(realPath, "utf8");

      // Strip TS types before analysis — we read the raw .server source, and the
      // Rollup parser (this.parse) is JS-only. esbuild preserves the top-level
      // "use server" directive and the export names, which is all we need.
      const isTsx = /\.[tj]sx$/.test(realPath);
      const { code: js } = await transformWithEsbuild(src, realPath, {
        loader: isTsx ? "tsx" : "ts",
      });
      const analysis = await analyzeModule(js, {
        loader: { parse: (s: string) => rslParse(s).ast as unknown as Program },
      });
      if (
        analysis.type !== "success" ||
        analysis.directiveInfo?.fileLevel?.type !== "server"
      ) {
        // Not actually a "use server" module — hand back the real source.
        return src;
      }
      const exportNames = Array.from(analysis.exports.exports.values()).map(
        (e) => e.exportName
      );
      if (exportNames.length === 0) return src;

      const normalizedPath = normalizer ? normalizer(realPath)[1] : realPath;
      const hostedId = moduleID ? moduleID(normalizedPath, src, false) : normalizedPath;

      if (this.environment?.name === "client") {
        return [
          `import { createServerReference } from "react-server-dom-esm/client.browser";`,
          `import { createCallServer } from "vite-plugin-react-server/utils";`,
          `const callServer = createCallServer(${JSON.stringify(viteBase)});`,
          ...exportNames.map(
            (n) =>
              `export const ${n} = createServerReference(${JSON.stringify(
                `${hostedId}#${n}`
              )}, callServer);`
          ),
        ].join("\n");
      }
      // SSR: render-safe stub (never called during render; no browser transport).
      return exportNames
        .map(
          (n) =>
            `export const ${n} = () => { throw new Error(${JSON.stringify(
              `Server function "${n}" cannot run during SSR; it executes in the browser via a server reference.`
            )}); };`
        )
        .join("\n");
    },
  };
};
