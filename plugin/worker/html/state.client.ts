import type { PassThrough } from "node:stream";
import { getModuleRef } from "../../helpers/moduleRefs.js";

// Track active RSC streams
export const activeStreams = new Map<string, PassThrough>();

// Track module IDs
export const moduleIds = new Map<string, string>();

// Track resolved components cache using Map for better memory management
export const temporaryReferences = new WeakMap<any, any>();


export function addModuleId(id: string, url: string) {
  moduleIds.set(id, url);
}

// Helper to cache a resolved component
export function cacheComponent(id: string, component: any) {
  const moduleRef = getModuleRef(id);
  temporaryReferences.set(moduleRef, component);
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

export function getModuleId(id: string): string | undefined {
  return moduleIds.get(id);
}
