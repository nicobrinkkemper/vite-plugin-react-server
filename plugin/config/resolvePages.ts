import type { ResolvedUserOptions } from '../types.js';

export async function resolvePages(
  pages: ResolvedUserOptions["build"]["pages"]
): Promise<{ type: "success"; error?:never; pages: string[] } | { type: "error"; error: Error; pages?:never }> {
  if (!pages) {
    return { type: "success", pages: [] };
  }

  try {
    // Handle function
    if (typeof pages === "function") {
      const result = pages();
      if(result instanceof Promise) {
        return resolvePages(await result);
      }
      return resolvePages(result);
    }

    // Handle Promise
    if (pages instanceof Promise) {
      return resolvePages(await pages);
    }

    // Handle string
    if (typeof pages === "string") {
      return { type: "success", pages: [pages] };
    }

    // Handle array
    if (Array.isArray(pages)) {
      if (pages.every(page => typeof page === "string")) {
        return { type: "success", pages };
      }
      throw new Error('All pages must be strings');
    }

    throw new Error('Invalid pages format');
  } catch (error) {
    return {
      type: "error",
      error: error instanceof Error ? error : new Error('Failed to resolve pages')
    };
  }
} 