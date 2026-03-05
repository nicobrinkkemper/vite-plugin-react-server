// Conditional exports in package.json resolve to index.server.js or index.client.js.
// This barrel file is kept for backward compat with tools that don't support conditions.
import { getCondition } from './config/getCondition.js';
import type { VitePluginMainFn } from './types.js';

const condition = getCondition('');
const dir = new URL('./', import.meta.url).pathname.replace(/\/$/, '');

const mod = await import(`${dir}/plugin.${condition}.js`);
export const vitePluginReactServer: VitePluginMainFn = mod.vitePluginReactServer;
export const vitePluginReactClient: VitePluginMainFn = mod.vitePluginReactServer;

const orch = await import(`${dir}/orchestrator/createPluginOrchestrator.${condition === 'server' ? 'server' : 'client'}.js`);
export const createPluginOrchestrator = orch.createPluginOrchestrator;

export { getCondition } from './config/getCondition.js';
