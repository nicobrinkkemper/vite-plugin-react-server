import { getCondition } from './config/getCondition.js';

export const { vitePluginReactServer } = await import(`./plugin.${getCondition('')}.js`);