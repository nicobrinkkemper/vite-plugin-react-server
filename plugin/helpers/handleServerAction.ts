import { getCondition } from "../config/getCondition.js";

const condition = getCondition("");

const dirname = new URL("./", import.meta.url).pathname.replace(/\/$/, "");

// Conditionally import the appropriate version
export const { 
  handleServerAction,
  handleServerActionWithViteServer,
  parseServerActionRequest,
  createServerActionResponse,
  setupServerActionHeaders,
  createServerActionStream,
  handleServerActionError,
} = await import(`${dirname}/handleServerAction.${condition}.js`);


// Re-export types from the helper file
export type {
  ServerActionRequest,
  ServerActionHandlerOptions,
} from "./handleServerActionHelper.js"; 