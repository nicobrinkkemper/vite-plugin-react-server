/**
 * Deferred Static Generation
 * 
 * When using Vite's Environment API (buildApp), static generation must run
 * AFTER all environments (client, ssr, server) have completed their builds.
 * 
 * This module provides a mechanism to defer static generation:
 * 1. Client's closeBundle stores the generation function instead of executing it
 * 2. The buildApp hook calls runDeferredStaticGeneration() after all builds complete
 * 
 * This solves the build order problem where client's closeBundle runs before
 * the server environment builds, making the server manifest unavailable.
 */

let deferredFn: (() => Promise<void>) | null = null;

/**
 * Store a static generation function to be called later by buildApp.
 */
export function deferStaticGeneration(fn: () => Promise<void>): void {
  deferredFn = fn;
}

/**
 * Run the deferred static generation function (called by buildApp after all builds).
 * Returns false if no function was deferred.
 */
export async function runDeferredStaticGeneration(): Promise<boolean> {
  if (!deferredFn) return false;
  const fn = deferredFn;
  deferredFn = null;
  await fn();
  return true;
}

/**
 * Check if there's a deferred static generation pending.
 */
export function hasDeferredStaticGeneration(): boolean {
  return deferredFn !== null;
}

/**
 * Reset state (for test isolation).
 */
export function resetDeferredStaticGeneration(): void {
  deferredFn = null;
}
