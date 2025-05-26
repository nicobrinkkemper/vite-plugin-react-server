import { getCondition } from "../config/getCondition.js"

const condition  = getCondition('')
const loader = await import(`react-loader.${condition}.ts`);

export const { load, resolve } = loader;
