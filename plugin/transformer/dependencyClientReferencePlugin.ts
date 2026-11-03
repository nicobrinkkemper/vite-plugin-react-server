import type { Plugin } from "vite";
import { perEnvironmentState } from "vite";
import { analyzeModule } from "react-server-loader/directives";

/**
 * Dev-only: a `"use client"` module inside an installed dependency, referenced
 * from a server component, loads in the browser through the same specifier the
 * server graph imported it by.
 *
 * The browser's own imports of a dependency resolve through Vite's dep
 * optimizer (`/node_modules/.vite/deps/<pkg>.js`). A client reference that
 * names the raw file (`/node_modules/<pkg>/dist/x.js`) loads a second copy of
 * the package next to that pre-bundle: two module instances, so two copies of
 * every context, store or singleton the package keeps. A provider mounted by
 * one copy is invisible to a component from the other.
 *
 * So the server environment remembers which bare specifier resolved to each
 * file under `node_modules`, and the transform hands such a client module a
 * reference to a virtual browser module that re-exports its names from that
 * specifier. The browser resolves the specifier like any other import of the
 * package (pre-bundled or not, linked or not), so every path lands on one
 * instance. Builds are untouched: their references name emitted chunks.
 */

const PREFIX = "\0vprs-dep-client:";
// The id as the browser requests it: Vite serves `\0` ids under `/@id/__x00__`.
const URL_PREFIX = "/@id/__x00__vprs-dep-client:";

// A bare specifier: no relative/absolute path, no scheme or virtual prefix.
const BARE_SPECIFIER = /^[\w@][^:\0]*$/;

const specifierOf = perEnvironmentState(() => new Map<string, string>());

const cleanPath = (id: string) => id.replace(/[?#].*$/, "").replace(/\\/g, "/");

const isInstalledDependency = (path: string) =>
  path.includes("/node_modules/") && !path.includes("/node_modules/.vite/");

type EnvironmentContext = Parameters<typeof specifierOf>[0];

/**
 * The client-reference id for a dependency's `"use client"` module, or
 * `undefined` when the module was not reached through a bare specifier (the
 * caller keeps its own id). `code` is the module's source, read for its export
 * names.
 */
export async function dependencyClientReferenceId(
  context: EnvironmentContext,
  id: string,
  code: string
): Promise<string | undefined> {
  const specifier = specifierOf(context).get(cleanPath(id));
  if (!specifier) return undefined;
  const analysis = await analyzeModule(code);
  if (analysis.type !== "success") return undefined;
  const names = Array.from(analysis.exports.exports.values()).map(
    (e) => e.exportName
  );
  if (names.length === 0) return undefined;
  return (
    URL_PREFIX +
    specifier +
    "?names=" +
    names.map((n) => encodeURIComponent(n)).join(",")
  );
}

export const dependencyClientReferencePlugin = (): Plugin => ({
  name: "vite-plugin-react-server:dependency-client-reference",
  apply: "serve",
  enforce: "pre",
  resolveId: {
    filter: { id: [BARE_SPECIFIER, /^\0vprs-dep-client:/] },
    async handler(source, importer, options) {
      const env = this.environment?.name;
      if (source.startsWith(PREFIX)) {
        return env === "client" ? source : null;
      }
      if (env === "client" || env === "ssr" || !importer) return null;
      if (!BARE_SPECIFIER.test(source)) return null;
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (!resolved || resolved.external) return resolved;
      const path = cleanPath(resolved.id);
      if (isInstalledDependency(path) && !specifierOf(this).has(path)) {
        specifierOf(this).set(path, source.replace(/[?#].*$/, ""));
      }
      return resolved;
    },
  },
  load: {
    filter: { id: /^\0vprs-dep-client:/ },
    handler(id) {
      if (!id.startsWith(PREFIX)) return null;
      const rest = id.slice(PREFIX.length);
      const query = rest.indexOf("?names=");
      if (query === -1) return null;
      const specifier = rest.slice(0, query);
      const names = rest
        .slice(query + "?names=".length)
        .split(",")
        .filter(Boolean)
        .map((n) => decodeURIComponent(n));
      const list = names
        .map((n) => (/^[A-Za-z_$][\w$]*$/.test(n) ? n : JSON.stringify(n)))
        .join(", ");
      return `export { ${list} } from ${JSON.stringify(specifier)};\n`;
    },
  },
});
