import type { ViteDevServer } from "vite";
import type {
  InlineCssOpt,
  PagePropOpt,
  ResolvedUserOptions,
} from "../types.js";
import { logError, toError } from "../error/index.js";
import { join } from "path";
import { ReactDOMServer } from "../vendor/vendor.server.js";
import type { IncomingMessage, ServerResponse } from "http";

export async function handleServerAction<
  T extends PagePropOpt = PagePropOpt,
  InlineCss extends InlineCssOpt = InlineCssOpt
>(
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
  handlerOptions: ResolvedUserOptions<T, InlineCss>
) {
  let id = req.url?.split("?")[0] ?? "";
  try {
    if (handlerOptions.verbose) {
      server.config.logger.info(
        `[react-server] Handling server action request at ${req.url}`
      );
    }

    // Parse the request body
    let args: unknown[];
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      if (handlerOptions.verbose) {
        server.config.logger.info(`[react-server] Request body: ${body}`);
      }

      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) {
        // Format 1: Direct args array
        args = parsed;
        // Get the action ID from the request URL
        if (handlerOptions.verbose) {
          server.config.logger.info(
            `[react-server] Using action ID from URL: ${id}`
          );
        }
      } else if (parsed && typeof parsed === "object" && "id" in parsed) {
        // Format 2: Object with id and args
        id = parsed.id;
        args = parsed.args ?? [];
      } else {
        throw new Error("Invalid server action request format");
      }
    } catch (error: unknown) {
      throw new Error(`Failed to parse server action request`, {
        cause: toError(error),
      });
    }

    if (!id) {
      throw new Error("Server action ID is required");
    }

    if (handlerOptions.verbose) {
      server.config.logger.info(
        `[react-server] Server action request for ${id} with args: ${JSON.stringify(
          args
        )}`
      );
    }

    // Parse the server action ID to get the file path and export name
    const [filePath, exportName] = id.split("#");
    if (!filePath || !exportName) {
      throw new Error(
        `Invalid server action ID format: ${id}. Expected format: "path/to/file.ts#exportName"`
      );
    }

    // Convert the server action ID to a file path
    const actionPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
    const fullPath = join(handlerOptions.projectRoot, actionPath);
    if (handlerOptions.verbose) {
      server.config.logger.info(
        `[react-server] Resolved file path: id=${id}, actionPath=${actionPath}, projectRoot=${handlerOptions.projectRoot}, filePath=${fullPath}, exportName=${exportName}`
      );
    }

    // Load the server action module
    if (handlerOptions.verbose) {
      server.config.logger.info(`[react-server] Loading module: ${fullPath}`);
    }
    const module = await server.ssrLoadModule(fullPath);
    if (handlerOptions.verbose) {
      server.config.logger.info(
        `[react-server] Looking for action: ${exportName} in module with exports: ${Object.keys(
          module
        ).join(", ")}`
      );
    }
    const action = module[exportName];

    if (typeof action !== "function") {
      if (handlerOptions.verbose) {
        server.config.logger.error(
          `[react-server] Action not found: ${exportName} in module with exports: ${Object.keys(
            module
          ).join(", ")}`
        );
      }
      throw new Error(`Server action not found: ${id}`);
    }

    // Execute the server action
    if (handlerOptions.verbose) {
      server.config.logger.info(
        `[react-server] Executing action with args: ${JSON.stringify(args)}`
      );
    }
    const result = await action(...args);
    if (handlerOptions.verbose) {
      server.config.logger.info(
        `[react-server] Action completed successfully with result: ${JSON.stringify(
          result
        )}`
      );
    }

    // Send the response using RSC streaming
    res.setHeader("Content-Type", "text/x-component; charset=utf-8");
    res.setHeader("Content-Length", "0"); // Will be updated after streaming

    const { pipe } = ReactDOMServer.renderToPipeableStream(
      {
        type: "server-action-response",
        returnValue: result,
        id
      },
      handlerOptions.moduleBasePath,
      {
        onError(error: Error) {
          logError(error, server.config.logger);
          res.statusCode = 500;
          res.end();
        },
        onAllReady() {
          // Update content length after streaming is complete
          const contentLength = res.getHeader("Content-Length");
          if (contentLength) {
            res.setHeader("Content-Length", contentLength);
          }
        }
      }
    );

    pipe(res);
  } catch (error) {
    const err = toError(error);
    logError(err, server.config.logger);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/x-component; charset=utf-8");
    res.setHeader("Content-Length", "0"); // Will be updated after streaming

    const { pipe } = ReactDOMServer.renderToPipeableStream(
      {
        type: "server-action-response",
        returnValue: null,
        error: {
          digest: err.message || "",
          name: err.name || "Error",
        },
        id
      },
      handlerOptions.moduleBasePath,
      {
        onError(error: Error) {
          logError(error, server.config.logger);
          res.statusCode = 500;
          res.end();
        },
        onAllReady() {
          // Update content length after streaming is complete
          const contentLength = res.getHeader("Content-Length");
          if (contentLength) {
            res.setHeader("Content-Length", contentLength);
          }
        }
      }
    );
    pipe(res);
  }
}
