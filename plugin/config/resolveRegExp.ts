import type { RegExpOpt } from "../types.js";

interface DeserializedRegExp {
  source: string;
  flags: string;
  __isRegExp: boolean;
}

/**
 * Resolves a pattern to a RegExp object, handling various input types:
 * - RegExp objects (including deserialized ones)
 * - String patterns
 * - Default patterns
 * 
 * @example
 * ```ts
 * // String patterns
 * resolveRegExp("*.js")     // /.*\.js/
 * resolveRegExp("*.{js,ts}") // /.*\.(js|ts)/
 * 
 * // RegExp patterns
 * resolveRegExp(/\.js$/)    // /\.js$/
 * resolveRegExp(/\.js$/i)   // /\.js$/i
 * 
 * // Default patterns
 * resolveRegExp(undefined, "*.js")     // /.*\.js/
 * resolveRegExp(undefined, /\.js$/)    // /\.js$/
 * ```
 */
export function resolveRegExp(
  pattern?: RegExpOpt,
  defaultPattern: RegExpOpt = ""
): RegExp {
  // Handle RegExp objects (including deserialized ones)
  if (pattern instanceof RegExp) {
    return pattern;
  }
  
  // Handle deserialized RegExp objects
  if (pattern && typeof pattern === "object" && "__isRegExp" in pattern) {
    const deserialized = pattern as DeserializedRegExp;
    return new RegExp(deserialized.source, deserialized.flags);
  }

  // Handle string patterns
  if (typeof pattern === "string") {
    return new RegExp(pattern);
  }

  // Handle default patterns
  if (defaultPattern instanceof RegExp) {
    return defaultPattern;
  }
  
  if (defaultPattern && typeof defaultPattern === "object" && "__isRegExp" in defaultPattern) {
    const deserialized = defaultPattern as DeserializedRegExp;
    return new RegExp(deserialized.source, deserialized.flags);
  }

  // Convert any other default pattern to string and create RegExp
  return new RegExp(String(defaultPattern));
}