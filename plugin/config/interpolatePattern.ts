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
