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
    } else {
      logger.error(err.message);
    }
  }
  