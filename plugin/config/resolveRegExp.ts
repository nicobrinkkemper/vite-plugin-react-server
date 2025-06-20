import type { RegExpOpt } from "../types.js";
import { parsePattern } from "./parsePattern.js";

interface DeserializedRegExp {
  source: string;
  flags: string;
  __isRegExp: boolean;
}

/**
 * Resolves a pattern to a RegExp object, handling various input types:
 * - RegExp objects (including deserialized ones)
 * - String patterns (glob patterns like "*.js", "*.{js,ts}")
 * - Default patterns
 * 
 * This function is the main entry point for converting user-friendly patterns
 * into RegExp objects that can be used for matching filenames and paths.
 * 
 * @example
 * ```ts
 * // String patterns (glob patterns) - these get converted to regex
 * resolveRegExp("*.js")     // /.*\.js$/     (matches any .js file)
 * resolveRegExp("*.{js,ts}") // /.*\.(js|ts)$/ (matches .js or .ts files)
 * resolveRegExp("src/*.js")  // /^src\/.*\.js$/ (matches .js files in src/ directory)
 * resolveRegExp("*.js/i")    // /.*\.js$/i   (case-insensitive matching)
 * 
 * // RegExp patterns - these are used as-is
 * resolveRegExp(/\.js$/)    // /\.js$/       (same regex object)
 * resolveRegExp(/\.js$/i)   // /\.js$/i      (same regex object with flags)
 * 
 * // Default patterns - used when no pattern is provided
 * resolveRegExp(undefined, "*.js")     // /.*\.js$/     (uses default)
 * resolveRegExp(undefined, /\.js$/)    // /\.js$/       (uses default)
 * ```
 */
export function resolveRegExp(
  pattern?: RegExpOpt,
  defaultPattern: RegExpOpt = ""
): RegExp {
  // CASE 1: Handle RegExp objects (including deserialized ones)
  // If the pattern is already a RegExp object, use it directly
  if (pattern instanceof RegExp) {
    return pattern;
  }
  
  // CASE 2: Handle deserialized RegExp objects
  // These are RegExp objects that have been serialized to JSON and back
  // They have a special "__isRegExp" property to identify them
  if (pattern && typeof pattern === "object" && "__isRegExp" in pattern) {
    const deserialized = pattern as DeserializedRegExp;
    return new RegExp(deserialized.source, deserialized.flags);
  }

  // CASE 3: Handle string patterns (convert glob patterns to regex)
  // This is where the magic happens! We convert user-friendly glob patterns
  // like "*.js" into proper regex patterns like /.*\.js$/
  if (typeof pattern === "string") {
    const regex = parsePattern(pattern);
    if (regex) {
      return regex;
    }
  }

  // CASE 4: Handle default patterns (when no pattern is provided)
  // If no pattern was given, use the default pattern instead
  
  // If default is already a RegExp, use it
  if (defaultPattern instanceof RegExp) {
    return defaultPattern;
  }
  
  // If default is a deserialized RegExp, reconstruct it
  if (defaultPattern && typeof defaultPattern === "object" && "__isRegExp" in defaultPattern) {
    const deserialized = defaultPattern as DeserializedRegExp;
    return new RegExp(deserialized.source, deserialized.flags);
  }

  // If default is a string, convert it using parsePattern
  if (typeof defaultPattern === "string") {
    const regex = parsePattern(defaultPattern);
    if (regex) {
      return regex;
    }
  }
  
  // Fallback: convert anything else to string and try to create a RegExp
  // This is mainly for backward compatibility
  return new RegExp(String(defaultPattern || ""));
}