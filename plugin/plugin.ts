import { getCondition } from './config/getCondition.js';
import type { VitePluginMainFn } from './types.js';

export const { vitePluginReactServer } = (await import(`./plugin.${getCondition('')}.js`)) as { vitePluginReactServer: VitePluginMainFn };