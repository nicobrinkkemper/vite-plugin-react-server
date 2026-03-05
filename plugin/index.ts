// Fallback entry point. Prefer conditional exports in package.json:
//   "react-server" → index.server.js
//   "default"      → index.client.js
// This file uses dynamic import as a last resort.
import { getCondition } from './config/getCondition.js';
import type { VitePluginMainFn } from './types.js';

const condition = getCondition('');

let _vitePluginReactServer: VitePluginMainFn;

if (condition === 'server') {
  const mod = await import('./plugin.server.js');
  _vitePluginReactServer = mod.vitePluginReactServer;
} else {
  const mod = await import('./plugin.client.js');
  _vitePluginReactServer = mod.vitePluginReactServer;
}

export const vitePluginReactServer = _vitePluginReactServer;
export const vitePluginReactClient = _vitePluginReactServer;
export { createPluginOrchestrator } from './orchestrator/createPluginOrchestrator.js';
export { getCondition } from './config/getCondition.js';
