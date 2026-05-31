import { detectClientModule, type ParseFn } from "./detectClientModule.js";

/**
 * Robustly detect whether `source` declares a *file-level* `"use client"`
 * directive (top-of-file, before any real code — the React contract).
 *
 * Thin compatibility wrapper around {@link detectClientModule}; existing
 * call sites and tests continue to import this. New code should prefer
 * `detectClientModule` directly, which also handles the filename pattern
 * and the no-source case.
 *
 * @param source   Original module source content.
 * @param parseFn  Optional AST producer (e.g. Rollup's `this.parse`). Falls
 *                 back to the parser-free char-scanner when omitted.
 */
export function hasFileLevelClientDirective(
  source: string | undefined,
  parseFn?: ParseFn,
): boolean {
  return detectClientModule({ source, parseFn });
}
