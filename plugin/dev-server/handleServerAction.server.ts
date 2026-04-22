import type { HandleServerActionFn } from "./types.js";
import { assertReactServer } from "../config/getCondition.js";
import { handleServerActionWithViteServer } from "../helpers/handleServerAction.server.js";

assertReactServer()

export const handleServerAction: HandleServerActionFn =
  async function _handleServerAction(req, res, server, handlerOptions) {
    return handleServerActionWithViteServer(req, res, server, handlerOptions);
  };
