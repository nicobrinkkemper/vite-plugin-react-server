import type { RegExpOpt } from "../types.js";
import { interpolatePattern } from "./interpolatePattern.js";
import { parsePattern } from "./parsePattern.js";


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
  if (pattern instanceof RegExp) {
    return (path: string) => pattern.test(path);
  }
  if (typeof pattern === "function") {
    return pattern;
  }
  if (typeof pattern === "string") {
    const interpolatedPattern = interpolatePattern(pattern, values);
    const regex = parsePattern(interpolatedPattern);
    return (path: string) => regex.test(path);
  }
  if (defaultPattern instanceof RegExp) {
    return (path: string) => defaultPattern.test(path);
  }
  if (typeof defaultPattern === "function") {
    return defaultPattern;
  }
  if (typeof defaultPattern === "string") {
    const interpolatedPattern = interpolatePattern(defaultPattern, values);
    const regex = parsePattern(interpolatedPattern);
    return (path: string) => regex.test(path);
  }
  throw new Error("No valid pattern provided");
}
