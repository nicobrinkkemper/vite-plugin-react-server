/**
 * Augments the cryptic module-link failure you get when a SERVER-graph module
 * imports a CLIENT-ONLY React API.
 *
 * React 19's react-server build (the `react-server` condition) deliberately
 * omits the client-side APIs ("poisoned imports", RFC 0227). When a module
 * that runs in the server graph does `import { createContext } from "react"`,
 * the failure surfaces as a bare linker error with no hint of the real cause:
 *
 *   - ESM link:  "The requested module 'react' does not provide an export
 *     named 'createContext'"
 *   - CJS interop: "Named export 'createContext' not found. The requested
 *     module 'react' is a CommonJS module, ..."
 *
 * This helper recognizes that failure class — the named export must be one
 * of the APIs the react-server build omits, and the requested module must be
 * react — and rewrites it to name the API, the module being loaded, and the
 * fix. It is an explicit diagnostic only: the import still fails (no silent
 * stub/polyfill smuggling client behavior into the server graph).
 */

/**
 * Exports present in react's client build but omitted from the react-server
 * build. Derived by export-diffing `react` with and without the
 * `react-server` condition (react 19.2.x); includes the two `__*` internals
 * for completeness, though user code should never import those.
 */
export const REACT_SERVER_OMITTED_EXPORTS = new Set([
  "Activity",
  "Component",
  "PureComponent",
  "act",
  "createContext",
  "startTransition",
  "unstable_useCacheRefresh",
  "useActionState",
  "useContext",
  "useDeferredValue",
  "useEffect",
  "useEffectEvent",
  "useImperativeHandle",
  "useInsertionEffect",
  "useLayoutEffect",
  "useOptimistic",
  "useReducer",
  "useRef",
  "useState",
  "useSyncExternalStore",
  "useTransition",
  "__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE",
  "__COMPILER_RUNTIME",
]);

const ESM_LINK_RE =
  /The requested module '([^']+)' does not provide an export named '([^']+)'/;
const CJS_INTEROP_RE =
  /Named export '([^']+)' not found\.[\s\S]*?The requested module '([^']+)' is a CommonJS module/;

/** Is the requested specifier/path the `react` package itself? */
const isReactModule = (spec: string): boolean =>
  spec === "react" ||
  /(?:^|[\\/])react[\\/]/.test(spec) ||
  /(?:^|[\\/])react\.[^\\/]*\.js$/.test(spec);

export function augmentClientOnlyImportError(
  error: unknown,
  loadingModuleId?: string
): unknown {
  if (!(error instanceof Error)) return error;
  if (
    (error as { vprsClientOnlyImportAugmented?: boolean })
      .vprsClientOnlyImportAugmented
  ) {
    return error;
  }

  const message = error.message || "";
  let requestedModule: string | undefined;
  let exportName: string | undefined;

  const esm = message.match(ESM_LINK_RE);
  if (esm) {
    [, requestedModule, exportName] = esm;
  } else {
    const cjs = message.match(CJS_INTEROP_RE);
    if (cjs) {
      [, exportName, requestedModule] = cjs;
    }
  }

  if (
    !requestedModule ||
    !exportName ||
    !isReactModule(requestedModule) ||
    !REACT_SERVER_OMITTED_EXPORTS.has(exportName)
  ) {
    return error;
  }

  const where = loadingModuleId
    ? ` while loading "${loadingModuleId}"`
    : "";
  const augmented = new Error(
    `${message}\n\n[vite-plugin-react-server] \`${exportName}\` is a ` +
      `CLIENT-ONLY React API: React's react-server build deliberately omits ` +
      `it, so a module that runs in the SERVER graph cannot import it. A ` +
      `server-reachable module imported \`${exportName}\` from "react"` +
      `${where}. Fix: add \`"use client"\` at the top of the module that ` +
      `uses \`${exportName}\` (or move that usage into a client component); ` +
      `server components can feed it data via props/children instead.`
  );
  augmented.stack = error.stack;
  (augmented as { cause?: unknown }).cause = error;
  (augmented as { vprsClientOnlyImportAugmented?: boolean })
    .vprsClientOnlyImportAugmented = true;
  return augmented;
}
