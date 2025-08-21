import type { RscRenderMessage } from "../worker/rsc/types.js";

/**
 * Validates that the message is of the correct type for RSC rendering
 * 
 * @param message - The RSC render message to validate
 * @throws {Error} If the message type is not "RSC_RENDER"
 */
export function validateRscRenderMessage(message: RscRenderMessage): void {
  if (message.type !== "RSC_RENDER") {
    throw new Error("Invalid message type");
  }
}
