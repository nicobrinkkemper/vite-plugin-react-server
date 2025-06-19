import type { RegExpOpt, DeserializedRegExp } from "../types.js";
import { parsePattern } from "./parsePattern.js";


/**
 * Resolves a pattern to a RegExp or function, handling string, RegExp, and function inputs.
 * For strings, it creates a new RegExp using user-friendly syntax.
 * For RegExp objects, it returns them as-is.
 * For functions, it returns them as-is. Functions are only supported
 * when this function is called programmatically, not through plugin options.
 *
 * @example
 * ```ts
 * // String patterns
 * resolveAutoDiscoverMatcher("*.js").test("file.js")     // true
 * resolveAutoDiscoverMatcher("*.{js,ts}").test("file.ts") // true
 *
 * // RegExp patterns
 * resolveAutoDiscoverMatcher(/\.js$/).test("file.js")    // true
 * resolveAutoDiscoverMatcher(/\.js$/i).test("file.JS")   // true
 *
 * // Default patterns
 * resolveAutoDiscoverMatcher(undefined, "*.js").test("file.js")     // true
 * resolveAutoDiscoverMatcher(undefined, /\.js$/).test("file.js")    // true
 * ```
 */
export function resolveDirectiveMatcher(
  pattern?: RegExpOpt,
  defaultPattern: RegExpOpt | ((source: string, moduleId?: string) => boolean) = () => false
): (source: string, moduleId?: string) => boolean {
  if (typeof pattern === "function") {
    return pattern;
  } else if (typeof pattern === "string") {
    return parsePattern(pattern)?.test.bind(null) ?? (() => false);
  } else if (typeof defaultPattern === "string") {
    return parsePattern(defaultPattern)?.test.bind(null) ?? (() => false);
  } else if (
    typeof defaultPattern === "object" &&
    defaultPattern != null &&
    (defaultPattern instanceof RegExp || "test" in defaultPattern)
  ) {
    return (source: string, moduleId?: string) => {
      if (defaultPattern instanceof RegExp) {
        return defaultPattern.test(source);
      }
      if ("__isRegExp" in defaultPattern) {
        const deserialized = defaultPattern as DeserializedRegExp;
        return new RegExp(deserialized.source, deserialized.flags).test(source);
      }
      return false;
    };
  } else {
    return defaultPattern as (source: string, moduleId?: string) => boolean;
  }
}

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

/**
 * Interpolates values into a string pattern.
 * Only replaces exact matches of {key} with their values.
 *
 * @example
 * ```ts
 * interpolatePattern("*.{ext}", { ext: "js" })     // "*.js"
 * interpolatePattern("src/*.{ext}", { ext: "js" }) // "src/*.js"
 * interpolatePattern("*.{ext}", { ext: "js|ts" })  // "*.js|ts"
 * ```
 */
export function interpolatePattern(
  pattern: string,
  values: Record<string, string>
): string {
  return pattern.replace(/\{(\w+)\}/g, (match, key) => {
    return values[key] ?? match;
  });
}
