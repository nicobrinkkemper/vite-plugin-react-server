import { workerData } from "node:worker_threads";
import { createCssProps } from "../../helpers/createCssProps.js";
import type { CssContent, ResolvedUserOptions, HmrState } from "../../types.js";
import type { PassThrough } from "node:stream";
import { relative, join } from "node:path";
import { isPathWithin } from "../../helpers/isPathWithin.js";
import { createReferenceGate } from "react-server-loader/references";
import { registerServerReference } from "react-server-dom-esm/server";
import { createLazyTemporaryReferenceSet } from "../../react-static/temporaryReferences.server.js";
import { getModuleRef } from "../../helpers/moduleRefs.js";

// Track active RSC streams
export const activeStreams = new Map<string, PassThrough>();

// Track CSS files
export const cssFiles = new Map<string, CssContent>();

// Track module IDs
export const moduleIds = new Map<string, string>();

const projectRoot =
  (workerData?.userOptions?.projectRoot as string | undefined) ?? process.cwd();
const moduleBasePath =
  (workerData?.userOptions?.moduleBasePath as string | undefined) ?? "";

const SERVER_REFERENCE_TAG = Symbol.for("react.server.reference");
const tagServerReference = registerServerReference as (
  ref: unknown,
  id: string,
  exportName?: string
) => unknown;

// Tag a freshly imported module's function exports as server references when
// they aren't already. The server build's transform does this via
// registerServerReference; a raw dev import doesn't, so the gate (which verifies
// the tag) would reject otherwise-valid actions. Dev fallback only — open mode
// is explicitly not a trust boundary, so tagging on demand here is sound.
function tagServerExports(
  moduleId: string,
  mod: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(mod)) {
    const value = mod[name];
    out[name] =
      typeof value === "function" &&
      (value as { $$typeof?: symbol }).$$typeof !== SERVER_REFERENCE_TAG
        ? tagServerReference(value, moduleId, name)
        : value;
  }
  return out;
}

// Open mode for now: an unregistered id falls back to devResolve — a raw import
// of the real path (NOT derived from the id beyond the basePath strip), with its
// exports tagged so the gate can verify them. Sealing — the prod trust boundary
// that rejects unregistered ids — registers from the build manifest instead;
// tracked as bead i0j.
export const referenceGate = createReferenceGate({
  mode: "open",
  devResolve: async (key) => {
    const actionPath =
      moduleBasePath && key.startsWith(moduleBasePath)
        ? key.slice(moduleBasePath.length)
        : key;
    const fullPath = join(projectRoot, actionPath);
    // Containment guard (defense in depth). Open mode is dev-only and not a trust
    // boundary, but `join` collapses `../`, so without this a crafted id could
    // resolve and import a module outside the project root. Mirrors the
    // main-thread resolveServerAction guard.
    if (!isPathWithin(projectRoot, fullPath)) {
      throw new Error(
        `Server action id resolves outside the project root: ${key}`
      );
    }
    const mod = (await import(fullPath)) as Record<string, unknown>;
    return tagServerExports(key, mod);
  },
});

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
  referenceGate.register({ id, kind: "server", load: () => import(url) });
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
