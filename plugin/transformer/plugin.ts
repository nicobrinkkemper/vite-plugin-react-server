import { getCondition } from '../config/getCondition.js';

export const { reactTransformPlugin } = await import(`./plugin.${getCondition('')}.js`);