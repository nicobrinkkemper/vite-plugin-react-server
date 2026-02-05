import type { ViteDevServer } from "vite";
import type {
  InlineCssOpt,
  PagePropOpt,
  ResolvedUserOptions,
} from "../types.js";
import { logError, toError } from "../error/toError.js";
import { ReactDOMServer } from "../vendor/vendor.server.js";
import type { IncomingMessage, ServerResponse } from "http";
import {
  parseServerActionRequest,
  createServerActionResponse,
  setupServerActionHeaders,
} from "../helpers/handleServerAction.js";
import { executeServerAction } from "../helpers/executeServerAction.js";
import { createPluginLogger } from "../helpers/logger.js";

export async function handleServerAction<
  T extends PagePropOpt = PagePropOpt,
  InlineCss extends InlineCssOpt = InlineCssOpt
>(
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
  handlerOptions: ResolvedUserOptions<T, InlineCss>
) {
  const log = createPluginLogger(
    handlerOptions.verbose,
    server.config.logger
  );
  let id = req.url?.split("?")[0] ?? "";
  try {
    log.debug(`[react-server] Handling server action request at ${req.url}`);

    // Parse the request body
    let args: unknown[];
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      log.debug(`[react-server] Request body: ${body}`);

      const parsed = parseServerActionRequest(body, req.url);
      id = parsed.id;
      args = parsed.args;
    } catch (error: unknown) {
      throw new Error(`Failed to parse server action request`, {
        cause: toError(error),
      });
    }

    if (!id) {
      throw new Error("Server action ID is required");
    }

    log.debug(
      `[react-server] Server action request for ${id} with args: ${JSON.stringify(
        args
      )}`
    );

    // Execute the server action
    log.debug(`[react-server] Executing action with args: ${JSON.stringify(args)}`);
    const result = await executeServerAction(id, args, {
      projectRoot: handlerOptions.projectRoot,
      moduleBasePath: handlerOptions.moduleBasePath,
      loader: server.ssrLoadModule,
    });
    log.debug(
      `[react-server] Action completed successfully with result: ${JSON.stringify(
        result
      )}`
    );

    // Send the response using RSC streaming
    setupServerActionHeaders(res);

    const responsePayload = createServerActionResponse(result);
    const { pipe } = ReactDOMServer.renderToPipeableStream(
      responsePayload,
      handlerOptions.moduleBasePath,
      {
        onError(error: Error) {
          logError(error, server.config.logger);
          res.statusCode = 500;
          res.end();
        },
        onAllReady() {}
      }
    );

    pipe(res);
  } catch (error) {
    const err = toError(error);
    logError(err, server.config.logger);
    res.statusCode = 500;
    setupServerActionHeaders(res);

    const responsePayload = createServerActionResponse(
      undefined,
      err.message || "Error"
    );
    const { pipe } = ReactDOMServer.renderToPipeableStream(
      responsePayload,
      handlerOptions.moduleBasePath,
      {
        onError(error: Error) {
          logError(error, server.config.logger);
          res.statusCode = 500;
          res.end();
        },
        onAllReady() {}
      }
    );
    pipe(res);
  }
}
