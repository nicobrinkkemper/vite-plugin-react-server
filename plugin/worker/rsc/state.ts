import { createLogger } from "../../utils/logger.js";

const log = createLogger('rsc-worker');

// Create shared CSS registry
export const cssFiles = new Map<string, string>();
export const clientFiles = new Set<string>();
export const serverActionFiles = new Set<string>();
// Helper functions
export function clearCssFiles() {
  log.info('Clearing CSS files');
  cssFiles.clear();
}

export function clearClientFiles() {
  log.info('Clearing client files');
  clientFiles.clear();
}

export function clearServerActionFiles() {
  log.info('Clearing server action files');
  serverActionFiles.clear();
}

export function addCssFile(id: string, cssFile: string) {
  cssFiles.set(id, cssFile);
  log.info(`Added CSS file: ${id}, contents: ${cssFile.substring(0, 50)}..., map size: ${cssFiles.size}`);
  log.info('Current map contents:', Array.from(cssFiles.entries()));
} 

export function addClientFile(url: string) {
  clientFiles.add(url);
  log.info(`Added client file: ${url}, total files: ${clientFiles.size}`);
}

export function addServerActionFile(url: string) {
  serverActionFiles.add(url);
  log.info(`Added server action file: ${url}, total files: ${serverActionFiles.size}`);
}

export function clearAllFiles() {
  clearCssFiles();
  clearClientFiles();
  clearServerActionFiles();
} 