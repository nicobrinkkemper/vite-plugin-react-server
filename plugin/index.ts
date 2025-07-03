import { getCondition } from './config/getCondition.js';

// Add logging to see what's importing this
console.log('[plugin/index.js] Being imported from:', new Error().stack?.split('\n')[2]);

const condition = getCondition('');

export const { vitePluginReactServer } = await import(`./plugin.${condition}.js`);