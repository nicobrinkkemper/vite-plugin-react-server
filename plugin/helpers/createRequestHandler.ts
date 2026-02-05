import type { Connect, Logger } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import type { ResolvedUserOptions } from "../types.js";
import { requestInfo } from "./requestInfo.js";

export type RequestInfoResult = ReturnType<typeof requestInfo>;

export function createRequestHandler(
  userOptions: Pick<
    ResolvedUserOptions,
    "normalizer" | "build" | "autoDiscover" | "verbose"
  >,
  hostDir: string,
  logger: Logger,
  handlers: {
    onServerAction: (
      info: RequestInfoResult,
      req: IncomingMessage,
      res: ServerResponse,
      next: Connect.NextFunction
    ) => unknown;
    onRsc: (
      info: RequestInfoResult,
      req: IncomingMessage,
      res: ServerResponse,
      next: Connect.NextFunction
    ) => unknown;
    onOther?: (
      info: RequestInfoResult,
      req: IncomingMessage,
      res: ServerResponse,
      next: Connect.NextFunction
    ) => unknown;
  }
): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url) return next();
    const info = requestInfo(req, userOptions, hostDir, logger);
    if (info.isServerActionRequest) {
      return handlers.onServerAction(info, req, res, next);
    }
    if (!info.isRscRequest) {
      if (handlers.onOther) {
        return handlers.onOther(info, req, res, next);
      }
      return next();
    }
    return handlers.onRsc(info, req, res, next);
  };
}
