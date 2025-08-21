import type { RegExpOpt } from "../types.js";
import { createPatternMatcher } from "../helpers/createPatternMatcher.js";

/**
 * Resolves a pattern with values, handling string, RegExp, and function inputs.
 * For strings, it interpolates values and creates a new RegExp.
 * For RegExp objects, it returns them as-is without interpolation.
 * For functions, it returns them as-is.
 *
 * @example
 * ```ts
 * // String patterns with interpolation
 * const jsMatcher = resolvePatternWithValues(
 *   "*.{ext}",
 *   "*.js",
 *   { ext: "js" }
 * );
 * jsMatcher("file.js")     // true
 * jsMatcher("file.ts")     // false
 *
 * // RegExp patterns (no interpolation)
 * const regexMatcher = resolvePatternWithValues(
 *   /\.js$/,
 *   "*.js",
 *   { ext: "js" }
 * );
 * regexMatcher("file.js")  // true
 * regexMatcher("file.ts")  // false
 *
 * // Complex patterns
 * const moduleMatcher = resolvePatternWithValues(
 *   "*.{ext}",
 *   "*.{js,ts,jsx,tsx}",
 *   { ext: "js|ts|jsx|tsx" }
 * );
 * moduleMatcher("file.tsx")  // true
 * moduleMatcher("file.css")  // false
 * ```
 */
export function resolvePatternWithValues(
  pattern?: RegExpOpt,
  defaultPattern?: RegExpOpt | ((path: string) => boolean),
  values: Record<string, string> = {}
): (path: string, moduleId?: string) => boolean {
  return createPatternMatcher(pattern, defaultPattern, {
    values,
    handleDeserialized: false,
    throwOnInvalid: true
  });
}
