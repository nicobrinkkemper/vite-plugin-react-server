import { getCondition } from './config/getCondition.js';
import type { VitePluginMainFn } from './types.js';
import { getNodeEnv } from './config/getNodeEnv.js';

export const nodeEnv = getNodeEnv(process.env.NODE_ENV);
export const condition = getCondition('');

export const { vitePluginReactServer, vitePluginReactClient } = (await import(`./plugin.${condition}.js`)) as { vitePluginReactServer: VitePluginMainFn, vitePluginReactClient: VitePluginMainFn };