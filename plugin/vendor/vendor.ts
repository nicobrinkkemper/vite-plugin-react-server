import { getCondition } from '../config/getCondition.js';

export const {
    React,
    ReactDOMServer,
} = await import(`./vendor.${getCondition('')}.js`);