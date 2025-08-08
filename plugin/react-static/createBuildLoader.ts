import { getCondition } from "../config/getCondition.js";
import type { CreateBuildLoaderFn } from "./types.js";

const condition = getCondition("");
const dir = new URL("./", import.meta.url);

const { createBuildLoader } = (await import(
  `${dir}/createBuildLoader.${condition}.js`
)) as { createBuildLoader: CreateBuildLoaderFn };

export { createBuildLoader };
