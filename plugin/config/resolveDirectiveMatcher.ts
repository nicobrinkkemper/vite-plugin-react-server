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
 * resolveDirectiveMatcher("*.js").test("file.js")     // true
 * resolveDirectiveMatcher("*.{js,ts}").test("file.ts") // true
 *
 * // RegExp patterns
 * resolveDirectiveMatcher(/\.js$/).test("file.js")    // true
 * resolveDirectiveMatcher(/\.js$/i).test("file.JS")   // true
 *
 * // Default patterns
 * resolveDirectiveMatcher(undefined, "*.js").test("file.js")     // true
 * resolveDirectiveMatcher(undefined, /\.js$/).test("file.js")    // true
 * ```
 */
export function resolveDirectiveMatcher(
  pattern?: RegExpOpt,
  defaultPattern: RegExpOpt | ((source: string, moduleId?: string) => boolean) = () => false
): (source: string, moduleId?: string) => boolean {
  if (typeof pattern === "function") {
    return pattern;
  } else if (pattern instanceof RegExp) {
    return (source: string, _moduleId?: string) => pattern.test(source);
  } else if (typeof pattern === "string") {
    const regex = parsePattern(pattern);
    return (source: string, _moduleId?: string) => regex.test(source);
  } else if (
    typeof pattern === "object" &&
    pattern != null &&
    "__isRegExp" in pattern
  ) {
    const deserialized = pattern as DeserializedRegExp;
    const regex = new RegExp(deserialized.source, deserialized.flags);
    return (source: string, _moduleId?: string) => regex.test(source);
  } else if (typeof defaultPattern === "function") {
    return defaultPattern;
  } else if (defaultPattern instanceof RegExp) {
    return (source: string, _moduleId?: string) => defaultPattern.test(source);
  } else if (typeof defaultPattern === "string") {
    const regex = parsePattern(defaultPattern);
    return (source: string, _moduleId?: string) => regex.test(source);
  } else {
    return () => false;
  }
}

