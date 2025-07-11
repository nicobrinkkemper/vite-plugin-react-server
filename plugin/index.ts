import { getCondition } from './config/getCondition.js';
import type { VitePluginMainFn } from './types.js';

const condition = getCondition('');

export const { vitePluginReactServer } = (await import(`./plugin.${condition}.js`)) as { vitePluginReactServer: VitePluginMainFn };