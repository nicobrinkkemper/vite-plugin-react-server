import type { RegExpOpt, DeserializedRegExp } from "../types.js";
import { interpolatePattern } from "../config/interpolatePattern.js";
import { parsePattern } from "../config/parsePattern.js";

/**
 * Unified pattern matcher that consolidates pattern resolution logic
 * used across resolveDirectiveMatcher and resolvePatternWithValues.
 * 
 * This helper reduces code duplication and provides consistent pattern matching
 * behavior across the codebase.
 */

export interface PatternMatcherOptions {
  /** Values for string interpolation */
  values?: Record<string, string>;
  /** Whether to handle deserialized RegExp objects */
  handleDeserialized?: boolean;
  /** Default fallback function when no pattern matches */
  fallback?: (input: string, moduleId?: string) => boolean;
  /** Whether to throw error on invalid patterns (vs using fallback) */
  throwOnInvalid?: boolean;
}

/**
 * Creates a pattern matcher function from various pattern types.
 * Consolidates logic from resolveDirectiveMatcher and resolvePatternWithValues.
 */
export function createPatternMatcher(
  pattern?: RegExpOpt,
  defaultPattern?: RegExpOpt | ((input: string, moduleId?: string) => boolean),
  options: PatternMatcherOptions = {}
): (input: string, moduleId?: string) => boolean {
  const {
    values = {},
    handleDeserialized = false,
    fallback = () => false,
    throwOnInvalid = false
  } = options;

  // Try primary pattern first
  const primaryMatcher = resolvePattern(pattern, values, handleDeserialized);
  if (primaryMatcher) {
    return primaryMatcher;
  }

  // Try default pattern
  const defaultMatcher = resolvePattern(defaultPattern, values, handleDeserialized);
  if (defaultMatcher) {
    return defaultMatcher;
  }

  // Handle invalid patterns
  if (throwOnInvalid) {
    throw new Error("No valid pattern provided");
  }

  return fallback;
}

/**
 * Internal helper to resolve a single pattern to a matcher function
 */
function resolvePattern(
  pattern: RegExpOpt | ((input: string, moduleId?: string) => boolean) | undefined,
  values: Record<string, string>,
  handleDeserialized: boolean
): ((input: string, moduleId?: string) => boolean) | null {
  // Function patterns
  if (typeof pattern === "function") {
    return pattern;
  }

  // RegExp patterns
  if (pattern instanceof RegExp) {
    return (input: string) => pattern.test(input);
  }

  // String patterns (with optional interpolation)
  if (typeof pattern === "string") {
    const interpolatedPattern = Object.keys(values).length > 0 
      ? interpolatePattern(pattern, values) 
      : pattern;
    const regex = parsePattern(interpolatedPattern);
    return (input: string) => regex.test(input);
  }

  // Deserialized RegExp patterns (for worker communication)
  if (
    handleDeserialized &&
    typeof pattern === "object" &&
    pattern != null &&
    "__isRegExp" in pattern
  ) {
    const deserialized = pattern as DeserializedRegExp;
    const regex = new RegExp(deserialized.source, deserialized.flags);
    return (input: string) => regex.test(input);
  }

  return null;
}
