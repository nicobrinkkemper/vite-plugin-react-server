import { getNodeEnv } from "../../getNodeEnv.js";

const envName = getNodeEnv() === "production" ? "production" : "development";

await import(`./html-worker.${envName}.js`);

export * from "./types.js";
