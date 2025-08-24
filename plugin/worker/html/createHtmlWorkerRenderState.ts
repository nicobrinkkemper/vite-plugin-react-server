import { PassThrough, Transform } from "node:stream";
import { join } from "node:path";
import { workerData } from "node:worker_threads";
import { createLogger } from "vite";
import { createStreamMetrics } from "../../helpers/metrics.js";
import { assertNonReactServer } from "../../config/getCondition.js";
import {
  React,
  ReactDOMClient,
  ReactDOMServer,
} from "../../vendor/vendor.client.js";
import type {
  HtmlWorkerRenderState,
  HtmlWorkerOutputMessage,
  HtmlRenderMessage,
} from "./types.js";

assertNonReactServer();

/**
 * Creates a complete HTML worker render state with proper streaming architecture.
 * This function immediately sets up createFromNodeStream so it can process RSC chunks as they arrive.
 */
export function createHtmlWorkerRenderState(
  {
    id = workerData.id,
    route = workerData.route,
    projectRoot = workerData.userOptions.projectRoot,
    moduleRootPath = workerData.userOptions.moduleRootPath,
    moduleBaseURL = workerData.userOptions.moduleBaseURL,
    moduleBasePath = workerData.userOptions.moduleBasePath,
    clientPipeableStreamOptions = workerData.userOptions
      .clientPipeableStreamOptions,
    verbose = Boolean(workerData.userOptions.verbose),
  }: Partial<HtmlRenderMessage> & { id?: string; route?: string },
  sendMessage: (msg: HtmlWorkerOutputMessage) => void,
  rscStream = new PassThrough()
): HtmlWorkerRenderState {
  const logger = createLogger();

  if (verbose) {
    logger.info(`[html-worker:${route}] Creating render state (${id})`);
  }

  if (typeof moduleRootPath !== "string") {
    throw new Error("moduleRootPath is required");
  } else if (!moduleRootPath.startsWith(projectRoot)) {
    moduleRootPath = join(projectRoot, moduleRootPath);
  }

  if (!moduleRootPath.endsWith("/")) {
    moduleRootPath = moduleRootPath + "/";
  }

  if (verbose) {
    logger.info(`[html-worker:${route}] Module resolution config:`);
    logger.info(`  - projectRoot: ${projectRoot}`);
    logger.info(`  - moduleRootPath: ${moduleRootPath}`);
    logger.info(`  - moduleBasePath: ${moduleBasePath}`);
    logger.info(`  - moduleBaseURL: ${moduleBaseURL}`);
  }

  // Note: callServer functionality would go here if needed
  // Currently simplified for basic HTML rendering

  // ✅ KEY: Create React elements from RSC stream IMMEDIATELY
  // This allows createFromNodeStream to listen for chunks as they arrive

  if (verbose) {
    logger.info(
      `[html-worker:${route}] Created React elements from RSC stream`
    );
  }

  const metrics = createStreamMetrics();

  // Create HTML transform stream to capture HTML chunks
  const htmlTransform = new Transform({
    transform(chunk, _encoding, callback) {
      metrics.chunks++;
      metrics.bytes += chunk.length;

      // Send HTML chunks to main thread
      sendMessage({
        type: "HTML_CHUNK",
        id: id!,
        chunk: chunk,
      } as HtmlWorkerOutputMessage);

      callback();
    },
    flush(callback) {
      sendMessage({
        type: "HTML_COMPLETE",
        id: id!,
        success: true,
        metrics: metrics,
      } as HtmlWorkerOutputMessage);
      callback();
    },
  });

  // Create React stream that will render the elements to HTML
  const stream = ReactDOMServer.renderToPipeableStream(
    React.createElement(() =>
      React.use(
        ReactDOMClient.createFromNodeStream(
          rscStream,
          moduleRootPath,
          moduleBaseURL
        )
      )
    ),
    {
      ...clientPipeableStreamOptions,
      onAllReady: () => {
        if (verbose) {
          logger.info(`[html-worker:${route}] All ready`);
        }

        sendMessage({
          type: "ALL_READY",
          id: id!,
        } as HtmlWorkerOutputMessage);
      },
      onError: (error: unknown, errorInfo?: any) => {
        if (verbose) {
          logger.error(
            `[html-worker:${route}] React stream onError: ${String(error)}`
          );
        }

        sendMessage({
          type: "ERROR",
          id: id!,
          error: error instanceof Error ? error : new Error(String(error)),
          errorInfo: errorInfo,
        } as HtmlWorkerOutputMessage);
      },
      onShellReady: () => {
        if (verbose) {
          logger.info(`[html-worker:${route}] Shell ready`);
        }

        sendMessage({
          type: "SHELL_READY",
          id: id!,
        } as HtmlWorkerOutputMessage);
      },
      onShellError: (error: unknown) => {
        if (verbose) {
          logger.error(`[html-worker:${route}] Shell error: ${String(error)}`);
        }

        sendMessage({
          type: "SHELL_ERROR",
          id: id!,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : "ShellError",
            cause: error instanceof Error ? error.cause : undefined,
          },
        } as HtmlWorkerOutputMessage);
      },
    }
  );

  // ✅ KEY: Pipe React stream to HTML transform immediately
  // This sets up the full pipeline: RSC → React Elements → HTML → Main Thread
  stream.pipe(htmlTransform);

  if (verbose) {
    logger.info(
      `[html-worker:${route}] Render state created - ready for RSC chunks`
    );
  }

  return {
    rscStream: rscStream,
    metrics,
    isReady: true,
    htmlTransform: htmlTransform,
    stream: stream,
    currentRoute: route,
    abort: () => {
      if (verbose) {
        logger.info(`[html-worker:${route}] Aborting render`);
      }
      stream.abort();
      rscStream.destroy();
      htmlTransform.destroy();
    },
  };
}
