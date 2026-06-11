import { workerData } from "node:worker_threads";
import { createCssProps } from "../../helpers/createCssProps.js";
import type { CssContent, ResolvedUserOptions, HmrState } from "../../types.js";
import type { PassThrough } from "node:stream";
import { relative } from "node:path";
import { createLazyTemporaryReferenceSet } from "../../react-static/temporaryReferences.server.js";
import { getModuleRef } from "../../helpers/moduleRefs.js";

// Track active RSC streams
export const activeStreams = new Map<string, PassThrough>();

// Track CSS files
export const cssFiles = new Map<string, CssContent>();

// Track module IDs
export const moduleIds = new Map<string, string>();

// Track resolved components cache using WeakMap for better memory management.
// Lazy: a module-scope createTemporaryReferenceSet() would force the vendored
// renderer to load during worker bootstrap with whatever NODE_ENV is set at
// that instant — the lazy set defers it to first render, where the paired
// variant logic applies (see vendor/lazyVendorModule.ts).
export const temporaryReferences = createLazyTemporaryReferenceSet();

// Track all cached component IDs so we can clear them on HMR
// This is necessary because temporaryReferences doesn't support iteration
const cachedComponentIds = new Set<string>();

export const hmrState = new Map<string, HmrState>();

if (workerData) {
  if (workerData.hmrPort) {
    workerData.hmrPort.on(
      "message",
      (msg: { type: string; path: string; routes?: string[] }) => {
        if (msg.type === "HMR_UPDATE") {
          // Normalize the path relative to project root
          const normalizedPath = relative(
            workerData.userOptions?.projectRoot,
            msg.path
          );
          hmrState.set(normalizedPath, {
            timestamp: Date.now(),
            invalidated: true,
            routes: msg.routes || [],
          });
          
          // CRITICAL: Clear component cache for invalidated modules
          // This ensures file changes are picked up immediately
          // We need to clear all cached components that might use this file
          // Since we can't iterate temporaryReferences, we'll rely on the
          // cache checks in messageHandler to skip invalidated modules
        } else if (msg.type === "HMR_ACCEPT") {
          // Normalize the path relative to project root
          const normalizedPath = relative(
            workerData.userOptions?.projectRoot,
            msg.path
          );
          hmrState.delete(normalizedPath);
        }
      }
    );
  }
} else {
  throw new Error("This module must be run with workerData");
}

export function addCssFileContent(
  id: string,
  code: string,
  userOptions: Pick<
    ResolvedUserOptions,
    | "projectRoot"
    | "moduleBaseURL"
    | "moduleBasePath"
    | "moduleRootPath"
    | "css"
    | "normalizer"
    | "moduleID"
    | "publicOrigin"
  >
) {
  if (typeof code !== "string") {
    throw new Error(
      `Expected css to be loaded as a string, but got ${typeof code}`
    );
  }
  cssFiles.set(
    id,
    createCssProps({
      id,
      code,
      userOptions,
    })
  );
}

// Helper to check if a module is invalidated
export function isModuleInvalidated(path: string): boolean {
  const state = hmrState.get(path);
  return state?.invalidated || false;
}

// Helper to clear HMR state for a module
export function clearHmrState(path: string): void {
  hmrState.delete(path);
}

// Helper to get all invalidated modules
export function getInvalidatedModules(): string[] {
  return Array.from(hmrState.entries())
    .filter(([, state]) => state.invalidated)
    .map(([path]) => path);
}

export function addModuleId(id: string, url: string) {
  moduleIds.set(id, url);
}

// Helper to cache a resolved component
export function cacheComponent(id: string, component: any) {
  const moduleRef = getModuleRef(id);
  temporaryReferences.set(moduleRef, component);
  // Track the ID so we can clear it later
  cachedComponentIds.add(id);
}

// Helper to get a cached component
export function getCachedComponent(id: string): any {
  const moduleRef = getModuleRef(id);
  return temporaryReferences.get(moduleRef);
}

// Helper to check if a component is cached
export function hasCachedComponent(id: string): boolean {
  const moduleRef = getModuleRef(id);
  return temporaryReferences.has(moduleRef);
}

// Helper to clear a cached component
export function clearCachedComponent(id: string): void {
  const moduleRef = getModuleRef(id);
  temporaryReferences.delete(moduleRef);
  cachedComponentIds.delete(id);
}

// Helper to clear all cached components (for HMR)
export function clearAllCachedComponents(): void {
  // Clear all tracked component IDs from temporaryReferences
  for (const id of cachedComponentIds) {
    const moduleRef = getModuleRef(id);
    temporaryReferences.delete(moduleRef);
  }
  cachedComponentIds.clear();
}

export function getModuleId(id: string): string | undefined {
  return moduleIds.get(id);
}
