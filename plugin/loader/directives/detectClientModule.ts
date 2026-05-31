import { analyzeDirectives } from "./analyzeDirectives.js";
import { sourceHasTopLevelClientDirective } from "./sourceHasTopLevelClientDirective.js";
import type { Program } from "acorn";

/**
 * Filename convention for client modules: `.client.` followed by a JS-family
 * extension (`.tsx/.ts/.jsx/.js/.mjs/.cjs/.mts/.cts`). Strict — a path that
 * merely contains the substring "client" elsewhere (e.g. `src/lib/clientId.ts`,
 * `src/client/foo.ts`) is not matched by this pattern; the directive check is
 * the other way a module qualifies.
 */
const CLIENT_FILENAME_PATTERN = /\.client\.[cm]?[jt]sx?$/;

export type ParseFn = (
  source: string,
  options?: { allowReturnOutsideFunction?: boolean; jsx?: boolean },
) => Program;

export type DetectClientModuleOpts = {
  /** Module source text. If absent or empty, only the filename pattern applies. */
  source?: string;
  /** Module identifier / file path. If absent, only the source check applies. */
  moduleId?: string;
  /**
   * Optional AST producer. When provided (the build's transformer plugin
   * passes Rollup's `this.parse`), the helper parses with JSX/TS awareness
   * and inspects directives via {@link analyzeDirectives}. When omitted
   * (dev-server file watcher, the worker react-loader, the configurable
   * `loader.*` defaults), the helper falls back to the parser-free
   * char-scanner from {@link sourceHasTopLevelClientDirective}. Both paths
   * agree on every well-authored case.
   */
  parseFn?: ParseFn;
};

/**
 * The single answer to "is this a client module?" for vprs.
 *
 * Recognises a module as client when EITHER:
 *   1. its filename matches the `.client.[cm]?[jt]sx?$` convention, OR
 *   2. its source declares a top-of-file `"use client"` directive — leading
 *      whitespace, line/block comments, and a `"use strict"` prologue
 *      tolerated above it (React's contract).
 *
 * Substring matches against "client" in identifiers, comments, import paths,
 * or directory names are deliberately rejected.
 *
 * Every call site that needs a "is this client?" answer routes through this
 * helper (transformer, worker react-loader, dev-server file watcher, build
 * auto-discover, the configurable `loader.*` defaults in
 * `config/defaults.tsx`), so the answer is the same for the same input at
 * every layer.
 */
export function detectClientModule({
  source,
  moduleId,
  parseFn,
}: DetectClientModuleOpts): boolean {
  // 1. Filename convention. Deterministic, doesn't need source content.
  if (moduleId && CLIENT_FILENAME_PATTERN.test(moduleId)) return true;

  // 2. Directive in source. Cheap pre-filter; no occurrence of "use client" →
  //    definitely not a client module, and we avoid both the parse and the
  //    scanner.
  if (!source) return false;
  if (!source.includes("use client")) return false;

  // 3. Prefer the AST path when a parser is available (build transformer).
  if (parseFn) {
    try {
      const ast = parseFn(source, {
        allowReturnOutsideFunction: true,
        jsx: true,
      });
      const directiveInfo = analyzeDirectives(ast, source);
      if (directiveInfo.fileLevel?.type !== "client") return false;
      // analyzeDirectives still records a misplaced `"use client";` (after
      // real code) as a file-level entry but flags it. React's contract
      // requires top-of-file placement, so a flagged one is not real.
      const misplaced = directiveInfo.warnings.some((w) =>
        w.message.includes("must be at the top of the file"),
      );
      return !misplaced;
    } catch {
      // Parse failure → fall through to the parser-free scanner. A genuine
      // `.client.*` was already caught in step 1.
    }
  }

  // 4. Parser-free fallback. Same structural contract.
  return sourceHasTopLevelClientDirective(source);
}
