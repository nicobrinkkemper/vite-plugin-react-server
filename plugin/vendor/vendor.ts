import { getCondition } from '../config/getCondition.js';

const condition = getCondition('')
const dirname = new URL('.', import.meta.url).pathname;
export const {
    React,
    ReactDOMServer,
} = (await import(`${dirname}/vendor.${condition}.js`)) as unknown as{React: typeof import('react'), ReactDOMServer: typeof import('react-dom/server')};