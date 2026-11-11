import type { SSROptions } from "vite";

/**
 * Merges `clientPackages` into the SSR-side `noExternal` list, preserving
 * whatever shape the user already supplied (`undefined` | `true` | string |
 * RegExp | array of those). The caller decides which `resolve.noExternal`
 * sites to apply this to.
 */
export const mergeClientPackagesNoExternal = (
  clientPackages: readonly string[],
  existing: NonNullable<SSROptions["noExternal"]> | undefined
): NonNullable<SSROptions["noExternal"]> => {
  if (clientPackages.length === 0) {
    return existing ?? [];
  }
  if (Array.isArray(existing)) {
    return [...existing, ...clientPackages];
  }
  if (existing == null) {
    return [...clientPackages];
  }
  // `true` already covers every package and is not valid inside an array.
  if (existing === true) {
    return true;
  }
  return [existing, ...clientPackages];
};

/**
 * Merges `clientPackages` into `optimizeDeps.exclude` so esbuild's pre-bundle
 * doesn't strip the per-file `"use client"` directives before the RSC
 * transform sees them.
 */
export const mergeClientPackagesOptimizeDepsExclude = (
  clientPackages: readonly string[],
  existing: readonly string[] | undefined
): string[] => {
  return [...(existing ?? []), ...clientPackages];
};
