import { getCondition } from './config/getCondition.js';
import { pluginRoot } from './root.js';
import type { VitePluginMainFn } from './types.js';

export const condition = getCondition('');
export const { vitePluginReactServer, vitePluginReactClient } = (await import(`${pluginRoot}/plugin.${condition}.js`)) as { vitePluginReactServer: VitePluginMainFn, vitePluginReactClient: VitePluginMainFn };