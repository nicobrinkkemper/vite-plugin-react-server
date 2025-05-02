import { getCondition } from './config/getCondition.js';

const condition = getCondition().slice(6); // remove react-

export const { vitePluginReactServer } = await import(`./plugin.${condition}.js`);