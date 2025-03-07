import type { ResolvedUserOptions } from '../types.js';

export let stashedPages: string[] = [];
export async function resolvePages(
  pages: ResolvedUserOptions["build"]["pages"]
): Promise<{ type: "success"; error?:never; pages: string[] } | { type: "error"; error: Error; pages?:never }> {
  if(stashedPages.length > 0){
    return { type: "success", pages: stashedPages };
  }
  if (!pages) {
    return { type: "success", pages: [] };
  }

  try {
    // Handle function
    if (typeof pages === "function") {
      return resolvePages(pages());
    }

    // Handle Promise
    if (pages instanceof Promise) {
      return resolvePages(await pages);
    }

    // Handle string
    if (typeof pages === "string") {
      stashedPages = [pages];
      return { type: "success", pages: [pages] };
    }

    // Handle array
    if (Array.isArray(pages)) {
      if (pages.every(page => typeof page === "string")) {
        stashedPages = pages;
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