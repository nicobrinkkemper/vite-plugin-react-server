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
  // STEP 1: Extract regex flags from the end of the pattern
  // 
  // We need to check if the pattern ends with "/flags" where flags are valid regex flags.
  // Valid regex flags are: g (global), i (case-insensitive), m (multiline), s (dotAll), u (unicode), y (sticky)
  //
  // Examples:
  // - "*.js/i"    -> patternStr = "*.js", flags = "i"
  // - "src/*.js"  -> patternStr = "src/*.js", flags = undefined (no flags)
  // - "*.js/gi"   -> patternStr = "*.js", flags = "gi"
  //
  // The regex /^(.+)\/([gimsuy]+)$/ breaks down as:
  // - ^(.+)       -> Capture everything from start, but at least one character
  // - \/          -> Match a literal forward slash
  // - ([gimsuy]+) -> Capture one or more valid regex flags
  // - $           -> Must be at the end of the string
  const flagMatch = pattern.match(/^(.+)\/([gimsuy]+)$/);
  let patternStr: string;
  let flags: string | undefined;
  
  if (flagMatch) {
    // Pattern has flags: "*.js/i" -> flagMatch[1] = "*.js", flagMatch[2] = "i"
    patternStr = flagMatch[1];
    flags = flagMatch[2];
  } else {
    // Pattern has no flags: "*.js" -> use the whole pattern
    patternStr = pattern;
  }

  // STEP 2: Convert glob-like patterns to regex patterns
  //
  // We need to convert user-friendly glob patterns into proper regex patterns:
  // - "*.js"      -> ".*\.js$"     (any characters, then .js at the end)
  // - "*.{js,ts}" -> ".*\.(js|ts)$" (any characters, then .js OR .ts at the end)
  // - "src/*.js"  -> "^src\/.*\.js$" (starts with src/, then any characters, then .js at the end)
  let regexStr = patternStr
    // Convert glob brace expansion {a,b} to regex alternation (a|b) FIRST
    .replace(/\{([^}]+)\}/g, (match, contents) => {
      const alternatives = contents.split(',').map((s: string) => s.trim());
      return `(${alternatives.join('|')})`;
    })
    // Escape special regex characters except for ( ) | and /
    .replace(/[.+?^${}\[\]\\]/g, "\\$&")
    // Convert glob wildcards (*) to regex wildcards (.*)
    .replace(/\*/g, ".*");

  // STEP 3: Ensure the pattern matches the entire string from start to end
  // Add ^ at the beginning and $ at the end if not already present
  if (!regexStr.startsWith('^')) {
    regexStr = '^' + regexStr;
  }
  if (!regexStr.endsWith('$')) {
    regexStr = regexStr + '$';
  }

  // STEP 4: Create and return the RegExp object
  return new RegExp(regexStr, flags);
} 