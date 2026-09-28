import type { Plugin } from "vite";

/**
 * A `require("react")` inside a CommonJS dependency that the ssr or server
 * environment bundles (a `clientPackages` entry, or any CJS module the graph
 * pulls in) targets an EXTERNAL of that environment: react, react-dom and
 * the jsx runtimes are externalized so the built output shares the host's
 * copy. rolldown cannot turn that require into an ESM import, so it emits
 * `__require("react")` backed by `createRequire(import.meta.url)`.
 *
 * Under a plain Node host that is merely slow: the runtime require resolves
 * the same node_modules/react the host imported. Once the chunk is baked into
 * a single-isolate bundle (buildConsumerBundle / buildEdgeBundle, both with
 * `noExternal: true`) it is a second React: the bake bundles React for the
 * renderer, the leftover `__require("react")` loads node_modules/react at
 * run time, react-dom activates the dispatcher on the bundled copy and the
 * dependency's hook reads the loaded copy whose dispatcher is null —
 * `Cannot read properties of null (reading 'useSyncExternalStore')` for every
 * use-sync-external-store/shim user (react-i18next, zustand, react-redux) the
 * moment the webpack freeze renders it. The `node:module` import the helper
 * drags along is also what a fetch runtime with no `node:*` rejects at load.
 *
 * `__require("<react-family>")` only ever appears when that specifier IS
 * external in the environment (a bundled copy would have been inlined), and
 * the react family is a fixed set of CommonJS packages, so it is safe to
 * hoist each into a static namespace import and hand the dependency the
 * module object (`ns.default`, which is `module.exports` under Node and under
 * rolldown's CJS interop alike). Same failure class as the `resolve.dedupe`
 * block in resolveUserConfig — one physical React per graph — closed on the
 * CommonJS side.
 */
const REACT_REQUIRE_RE =
  /\b__require\((["'])(react(?:-dom)?(?:\/[^"'\s]+)?)\1\)/g;

const NAMESPACE_PREFIX = "__vprsReact$";

export interface ReactRequireRewrite {
  code: string;
  /** External specifiers hoisted into static imports, in first-seen order. */
  specifiers: string[];
}

/**
 * Rewrite every `__require("react…")` in a rendered chunk to a static
 * namespace import. Returns null when the chunk has none.
 */
export const rewriteReactRequires = (
  code: string,
): ReactRequireRewrite | null => {
  if (!code.includes("__require(")) return null;

  const names = new Map<string, string>();
  const rewritten = code.replace(REACT_REQUIRE_RE, (_match, _quote, spec) => {
    let name = names.get(spec);
    if (!name) {
      name = `${NAMESPACE_PREFIX}${names.size}`;
      names.set(spec, name);
    }
    return `(${name}.default ?? ${name})`;
  });
  if (names.size === 0) return null;

  const imports = [...names]
    .map(([spec, name]) => `import * as ${name} from ${JSON.stringify(spec)};`)
    .join("\n");
  return {
    code: `${imports}\n${rewritten}`,
    specifiers: [...names.keys()],
  };
};

/**
 * Environments whose output externalizes React. The browser (`client`)
 * environment bundles React, so a CJS require there is inlined by rolldown
 * and never reaches this shape.
 */
const EXTERNAL_REACT_ENVIRONMENTS = new Set(["ssr", "server"]);

export const createReactRequireInteropPlugin = (): Plugin => {
  return {
    name: "vite-plugin-react-server:react-require-interop",
    enforce: "post",
    apply: "build",

    renderChunk(code) {
      const environment = this.environment?.name;
      if (environment && !EXTERNAL_REACT_ENVIRONMENTS.has(environment)) {
        return null;
      }
      const result = rewriteReactRequires(code);
      if (!result) return null;
      // vprs builds emit no sourcemaps; the only edit is a prepended import
      // line plus in-line call rewrites, so a consumer that enables them
      // sees at most a one-line skew in these chunks.
      return { code: result.code, map: null };
    },
  };
};
