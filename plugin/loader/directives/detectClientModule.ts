import { analyzeDirectives } from "./analyzeDirectives.js";
import { sourceHasTopLevelClientDirective } from "./sourceHasTopLevelClientDirective.js";
import type { Program } from "acorn";

/**
 * Filename convention for client modules: `.client.[jt]sx?`, also covering
 * the `.mjs/.cjs/.mts/.cts` variants. This is the *strict* form — the legacy
 * naive matcher `/(\.|\/)?client(\.|\/)?/` flagged any path containing the
 * substring "client" (e.g. `src/lib/clientId.ts`), which mis-classified
 * server modules as client. See the PR body for the behaviour-change note.
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
 * The single, robust answer to "is this a client module?" for vprs.
 *
 * Recognises a module as client when EITHER:
 *   1. its filename matches the `.client.[cm]?[jt]sx?$` convention, OR
 *   2. its source declares a top-of-file `"use client"` directive — leading
 *      whitespace, line/block comments, and a `"use strict"` prologue
 *      tolerated above it (React's contract).
 *
 * Deliberately rejects the naive "code contains the word client" substring
 * shape that the legacy `IS_CLIENT_COMPONENT_*` defaults used: a server
 * module with a variable named `clientId` or a comment mentioning "client"
 * stays a server module.
 *
 * This helper is the single source of truth for client-module detection.
 * Every other call site in the plugin (transformer, worker react-loader,
 * dev-server file watcher, build auto-discover, the configurable
 * `loader.*` defaults in `config/defaults.tsx`) routes through it,
 * eliminating the cross-layer divergence that produced PR #55
 * (compound-filename hosting) and the directive-only hosting gap.
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
