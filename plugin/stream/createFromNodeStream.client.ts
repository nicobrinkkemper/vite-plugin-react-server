import type { CreateFromNodeStreamFn } from "./createFromNodeStream.types.js";
import { ReactDOMClient, React } from "../vendor/vendor.client.js";
import { assertNonReactServer } from "../config/getCondition.js";

assertNonReactServer();

/**
 * Client version of createNodeStream.
 *
 * Strategy: Convert RSC stream to React elements using ReactDOMClient.createFromNodeStream.
 * This is the main use case for this function in client environments.
 */
export const createFromNodeStream: CreateFromNodeStreamFn<"client"> =
  function _createFromNodeStreamClient(options) {
    const { rscStream, logger, verbose = false } = options;
    let { moduleRootPath, moduleBasePath, moduleBaseURL } = options;

    if (!rscStream) {
      throw new Error(
        "[createNodeStream.client] rscStream is required for client version"
      );
    }

    if (verbose) {
      logger?.info(
        `[createNodeStream.client] Converting RSC stream to React elements, moduleRootPath: ${moduleRootPath}, moduleBasePath: ${moduleBasePath}, moduleBaseURL: ${moduleBaseURL} (type: ${typeof moduleBaseURL})`
      );
    }

    // Ensure moduleBaseURL is a string
    if (typeof moduleBaseURL !== "string") {
      logger?.warn?.(
        `[createNodeStream.client] moduleBaseURL is not a string: ${JSON.stringify(
          moduleBaseURL
        )} (type: ${typeof moduleBaseURL})`
      );
      moduleBaseURL = String(moduleBaseURL || "/");
    }
    if (!moduleRootPath) {
      moduleRootPath = "";
    } else if (!moduleRootPath.endsWith("/")) {
      moduleRootPath = `${moduleRootPath}/`;
    }
    if (!moduleBasePath) {
      moduleBasePath = "";
    } else if (!moduleBasePath.endsWith("/")) {
      moduleBasePath = `${moduleBasePath}/`;
    }

    // Add debugging for React and ReactDOMClient
    if (verbose) {
      logger?.info(
        `[createNodeStream.client] React.use available: ${typeof React.use}`
      );
      logger?.info(
        `[createNodeStream.client] ReactDOMClient.createFromNodeStream available: ${typeof ReactDOMClient.createFromNodeStream}`
      );
      logger?.info(
        `[createNodeStream.client] rscStream type: ${typeof rscStream}, readable: ${
          rscStream.readable
        }, destroyed: ${rscStream.destroyed}`
      );
    }

    return {
      type: "client" as const,
      children: React.createElement(() => {
        if (verbose) {
          logger?.info(
            `[createNodeStream.client] ReactDOMClient.createFromNodeStream available: ${typeof ReactDOMClient.createFromNodeStream}`
          );
        }
        const nodeStreamResult = ReactDOMClient.createFromNodeStream(
          rscStream,
          moduleRootPath,
          moduleBaseURL
        );
        if (verbose) {
          logger?.info(
            `[createNodeStream.client] ReactDOMClient.createFromNodeStream result: ${JSON.stringify(typeof nodeStreamResult)}`
          );
        }
        // Let React handle Suspense Exception naturally - don't catch it
        return React.use(nodeStreamResult);
      }),
    };
  };
