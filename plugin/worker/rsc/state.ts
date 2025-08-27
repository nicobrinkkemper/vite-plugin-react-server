import { workerData } from "node:worker_threads";
import { createCssProps } from "../../helpers/createCssProps.js";
import type { CssContent, ResolvedUserOptions, HmrState } from "../../types.js";
import type { PassThrough } from "node:stream";
import { relative } from "node:path";
import { ReactDOMServer } from "../../vendor/vendor.server.js";
import { getModuleRef } from "../../helpers/moduleRefs.js";

// Track active RSC streams
export const activeStreams = new Map<string, PassThrough>();

// Track CSS files
export const cssFiles = new Map<string, CssContent>();

// Track module IDs
export const moduleIds = new Map<string, string>();

// Track resolved components cache using WeakMap for better memory management
export const temporaryReferences = ReactDOMServer.createTemporaryReferenceSet();

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
