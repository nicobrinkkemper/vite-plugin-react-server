import { detectClientModule } from "react-server-loader/directives";

/**
 * The join contract with the stock esm transport: the browser composes
 * client-reference specifiers as `moduleBaseURL + id` (plain concat, upstream
 * React code). The pair is only coherent when exactly one side carries the
 * joining slash. vprs canonicalizes BOTH sides: hosted client-reference ids
 * are ROOTED (single leading slash, this module) and the base handed to the
 * flight client never ends in "/" (createReactFetcher). Coherent by
 * construction, independent of moduleBasePath config or custom moduleID fns.
 */

export type ModuleIDFn = (
  id: string,
  sourceContent?: string,
  isClientByDirective?: boolean
) => string;

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Root a client-reference id: exactly one leading slash. Absolute URLs
 * (scheme-prefixed) pass through — they are not composed with moduleBaseURL.
 */
export const canonicalModuleId = (id: string): string => {
  if (!id || SCHEME_RE.test(id)) return id;
  return "/" + id.replace(/^\/+/, "");
};

/**
 * Wrap a moduleID fn so hosted client-reference ids come out rooted. Only
 * client modules are canonicalized — server files, node_modules and virtual
 * ids keep the fn's verbatim answer (they never travel through the browser
 * join). Client detection mirrors createDefaultModuleID's isClientComponentId:
 * the transformer's directive answer when threaded, else `detectClientModule`
 * on the INPUT source — directive-only by design, the filename is not a
 * signal. A call without source or directive answer therefore canonicalizes
 * nothing, same as the inner fn hashes nothing for it.
 */
export const wrapModuleID = (fn: ModuleIDFn): ModuleIDFn => {
  const wrapped: ModuleIDFn = (id, sourceContent, isClientByDirective) => {
    const result = fn(id, sourceContent, isClientByDirective);
    const isClient =
      isClientByDirective === true ||
      detectClientModule({ source: sourceContent, moduleId: id });
    return isClient ? canonicalModuleId(result) : result;
  };
  return wrapped;
};
