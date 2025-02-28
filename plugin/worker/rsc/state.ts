import { createLogger } from "../../utils/logger.js";


// Create shared CSS registry
export const cssFiles = new Map<string, string>();
export const clientFiles = new Set<string>();
export const serverActionFiles = new Set<string>();
// Helper functions
export function clearCssFiles() {
  cssFiles.clear();
}

export function clearClientFiles() {
  clientFiles.clear();
}

export function clearServerActionFiles() {
  serverActionFiles.clear();
}

export function addCssFile(id: string, cssFile: string) {
  cssFiles.set(id, cssFile);
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