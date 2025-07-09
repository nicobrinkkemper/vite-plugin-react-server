import type { Logger } from "vite";
import { toError } from "./toError.js";
import { getNodeEnv } from "../getNodeEnv.js";

export function logError(error: unknown, logger: Logger | Console = console) {
    const err = toError(error);
    if (getNodeEnv() !== "production") {
      if (
        err.stack &&
        err.message.length > 0 &&
        err.stack.includes(err.message)
      ) {
        logger.error(err.stack);
      } else if (err.stack && err.stack.length > 0 && err.message.length > 0) {
        logger.error(err.message + "\n" + err.stack, {
          error: err,
        });
      } else if (err.stack && err.stack.length > 0) {
        logger.error(err.stack, {
          error: err,
        });
      } else if (err.message.length > 0) {
        logger.error(err.message, {
          error: err,
        });
      } else {
        logger.error("Unknown error", {
          error: err,
        });
      }
    } else if(typeof err.message === "string") {
      logger.error(err.message, {error: err});
    } else if(typeof err.message === "object" && err.message !== null && "message" in err.message) {
      logger.error(err.message, {error: err});
    } else if (err.stack) {
      logger.error(err.stack, {error: err});
    } else if (err != null && typeof err === "object" && 'reason' in err && typeof err.reason === "string") {
      logger.error(err.reason, {error: err});
    } else if (err != null && typeof err === "object" && 'error' in err && typeof err.error === "string") {
      logger.error(err.error, {error: err});
    } else {
      logger.error(JSON.stringify(err), {error: err});
    }
  }
  