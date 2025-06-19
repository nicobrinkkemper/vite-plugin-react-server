import type { DirectiveMatch } from "../loader/directives/types.js";

// Error types for better maintainability
export const DIRECTIVE_ERRORS = {
  FILE_LEVEL: {
    NOT_AT_TOP:
      "'use {directive}' directive must be at the top of the file, before any other statements.",
    MIXED_DIRECTIVES:
      "Cannot use both 'use client' and 'use server' directives in the same file",
  },
  FUNCTION_LEVEL: {
    CLIENT_NOT_ALLOWED:
      "Directive 'use client' is not allowed at function level. Only 'use server' is allowed at the start of async functions.",
    SERVER_NOT_ASYNC:
      "'use server' directive is only allowed at the start of async functions",
  },
} as const;

// Helper to check if a warning is about file-level issues
export function isFileLevelWarning(warning: DirectiveMatch): boolean {
  if (!warning.message) return false;
  return (
    warning.message ===
      DIRECTIVE_ERRORS.FILE_LEVEL.NOT_AT_TOP.replace("{directive}", "client") ||
    warning.message ===
      DIRECTIVE_ERRORS.FILE_LEVEL.NOT_AT_TOP.replace("{directive}", "server") ||
    warning.message === DIRECTIVE_ERRORS.FILE_LEVEL.MIXED_DIRECTIVES
  );
}
