import { assertNonReactServer } from "../../config/getCondition.js";

const env = process.env["NODE_ENV"] !== "development" && process.env["NODE_ENV"] !== "test" ? "production" : "development";
assertNonReactServer();
await import(`./html-worker.${env}.js`);