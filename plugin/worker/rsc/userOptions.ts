import { hydrateUserOptions } from "../../helpers/index.js";
import { workerData } from "node:worker_threads";
const userOptionsResult = hydrateUserOptions(workerData.userOptions)
if(userOptionsResult.type === "error") {
  throw userOptionsResult.error;
}
export const userOptions = userOptionsResult.userOptions;