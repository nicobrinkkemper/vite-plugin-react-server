import { getCondition } from './config/getCondition.js';

const condition = getCondition('');

export const { vitePluginReactServer } = await import(`./plugin.${condition}.js`);