import { workerData } from "node:worker_threads";
import { createCssProps } from "../../helpers/createCssProps.js";
import type { CssContent, ResolvedUserOptions, HmrState } from "../../types.js";
import type { PassThrough } from "node:stream";


// Track active RSC streams
export const activeStreams = new Map<string, PassThrough>();

// Track CSS files
export const cssFiles = new Map<string, CssContent>();


export const hmrState = new Map<string, HmrState>();

if(workerData) {
  if(workerData.hmrPort) {
    workerData.hmrPort.on('message', (msg: { type: string; path: string }) => {
      console.log('[RSC Worker] HMR message received:', msg);
      if(msg.type === 'HMR_UPDATE') {
        hmrState.set(msg.path, { 
          timestamp: Date.now(), 
          invalidated: true,
          routes: workerData.userOptions.build.pages
        });
      } else if(msg.type === 'HMR_ACCEPT') {
        hmrState.delete(msg.path);
      }
    });
  } else {
    console.warn('[RSC Worker] No HMR port found, HMR is disabled');
  }
} else {
  throw new Error("This module must be run with workerData");
}

// Create shared CSS registry
export const clientFiles = new Set<string>();
export const serverActionFiles = new Set<string>();

// Helper functions
export function clearCssFiles() {
  cssFiles.clear();
}

export function getCssFiles() {
  return cssFiles.entries();
}

export function clearClientFiles() {
  clientFiles.clear();
}

export function clearServerActionFiles() {
  serverActionFiles.clear();
}

export function addCssFile(id: string, cssFile: CssContent) {
  cssFiles.set(id, cssFile);
}


export function addCssFileContent(id: string, code: string, userOptions: Pick<ResolvedUserOptions, "projectRoot" | "moduleBaseURL" | "moduleBasePath" | "moduleRootPath" | "css">) {
  if(typeof code !== "string"){
    throw new Error(`Expected css to be loaded as a string, but got ${typeof code}`);
  }
  const normalizeId = id.startsWith(userOptions.moduleRootPath) ? id.slice(userOptions.moduleRootPath.length) : id;
  cssFiles.set(normalizeId, createCssProps({
    id,
    code,
    projectRoot: userOptions.projectRoot,
    moduleBaseURL: userOptions.moduleBaseURL,
    moduleBasePath: userOptions.moduleBasePath,
    moduleRootPath: userOptions.moduleRootPath,
    css: userOptions.css,
  }));
} 

export function addClientFile(url: string) {
  clientFiles.add(url);
}

export function addServerActionFile(url: string) {
  serverActionFiles.add(url);
}

export function clearAllFiles() {
  clearCssFiles();
  clearClientFiles();
  clearServerActionFiles();
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
    .filter(([_, state]) => state.invalidated)
    .map(([path]) => path);
} 