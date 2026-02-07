import type { RscRenderMessage } from "../worker/rsc/types.js";

/**
 * Validates that the message is of the correct type for RSC rendering
 * 
 * @param message - The RSC render message to validate
 * @throws {Error} If the message type is not "INIT"
 */
export function validateRscRenderMessage(message: RscRenderMessage): void {
  if (message.type !== "INIT") {
    throw new Error("Invalid message type");
  }
}
