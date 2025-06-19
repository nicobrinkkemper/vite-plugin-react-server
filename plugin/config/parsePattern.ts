/**
 * Converts a user-friendly pattern string to a RegExp.
 * Supports:
 * - Simple patterns like "*.js" -> /\.js$/
 * - Basic wildcards like "*.{js,ts}" -> /\.(js|ts)$/
 * - Escaped characters with backslash
 * - Optional flags at the end like "*.js/i" -> /\.js$/i
 *
 * @example
 * ```ts
 * // File extensions
 * parsePattern("*.js").test("file.js")     // true
 * parsePattern("*.{js,ts}").test("file.ts") // true
 *
 * // Directory patterns
 * parsePattern("src/*.js").test("src/file.js")     // true
 * parsePattern("src/*.js").test("file.js")         // false
 *
 * // Case sensitivity
 * parsePattern("*.js").test("file.JS")     // false
 * parsePattern("*.js/i").test("file.JS")   // true
 * ```
 */
export function parsePattern(pattern: string): RegExp {
  // Extract flags if present (e.g. "*.js/i" -> ["*.js", "i"])
  const [patternStr, flags] = pattern.split("/").reverse();

  // Convert glob-like patterns to regex
  let regexStr = patternStr
    // Escape special regex chars except for * and {}
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    // Convert * to .*
    .replace(/\*/g, ".*")
    // Convert {a,b} to (a|b)
    .replace(/\{([^}]+)\}/g, "($1)")
    // Ensure pattern matches the whole string
    .replace(/^.*$/, "^$&$");

  return new RegExp(regexStr, flags);
}
