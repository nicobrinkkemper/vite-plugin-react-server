import type { CreateFromNodeStreamFn } from "./createFromNodeStream.types.js";
import { React, ReactDOMClient } from "../vendor/vendor.client.js";
import { assertNonReactServer } from "../config/getCondition.js";

assertNonReactServer();

/**
 * Client version of createNodeStream.
 *
 * Strategy: Convert RSC stream to React elements using ReactDOMClient.createFromNodeStream.
 * This is the same approach used by the HTML worker for proper CSS handling and RSC processing.
 */
export const createFromNodeStream: CreateFromNodeStreamFn<"client"> =
  function _createFromNodeStreamClient(options) {
    const { rscStream, logger, verbose = false } = options;
    let { moduleRootPath, moduleBasePath, moduleBaseURL } = options;

    if(options.children) {
      if (verbose) {
        logger?.info(
          `[createNodeStream.client] Options already have children, skipping conversion`
        );
      }
      return {
        type: "client" as const,
        children: options.children as React.ReactElement,
      };
    }
    if(!rscStream) {
      throw new Error(
        "[createNodeStream.client] no rscStream nor children provided"
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

    if (verbose) {
      logger?.info(
        `[createNodeStream.client] Using ReactDOMClient.createFromNodeStream from react-server-dom-esm/client.node`
      );
      logger?.info(
        `[createNodeStream.client] rscStream type: ${typeof rscStream}, readable: ${
          rscStream.readable
        }, destroyed: ${rscStream.destroyed}`
      );
    }

    // Create a function component that processes the RSC stream
    const RscStreamComponent = () => {
      if (verbose) {
        logger?.info(
          `[createNodeStream.client] ReactDOMClient.createFromNodeStream available: ${typeof ReactDOMClient.createFromNodeStream}`
        );
      }
      
      // Use the same approach as HTML worker: convert RSC stream to React elements
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
    };

    return {
      type: "client" as const,
      children: React.createElement(RscStreamComponent),
    };
  };
