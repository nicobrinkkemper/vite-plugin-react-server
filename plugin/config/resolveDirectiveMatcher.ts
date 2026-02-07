import type { RegExpOpt } from "../types.js";
import { createPatternMatcher } from "../helpers/createPatternMatcher.js";

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
 * resolveDirectiveMatcher("*.js")("file.js")     // true
 * resolveDirectiveMatcher("*.{js,ts}")("file.ts") // true
 *
 * // RegExp patterns
 * resolveDirectiveMatcher(/\.js$/)("file.js")    // true
 * resolveDirectiveMatcher(/\.js$/i)("file.JS")   // true
 *
 * // Default patterns
 * resolveDirectiveMatcher(undefined, "*.js")("file.js")     // true
 * resolveDirectiveMatcher(undefined, /\.js$/)("file.js")    // true
 * ```
 */
export function resolveDirectiveMatcher(
  pattern?: RegExpOpt,
  defaultPattern: RegExpOpt | ((source: string, moduleId?: string) => boolean) = () => false
): (source: string, moduleId?: string) => boolean {
  return createPatternMatcher(pattern, defaultPattern, {
    handleDeserialized: true,
    fallback: () => false,
    throwOnInvalid: false
  });
}

