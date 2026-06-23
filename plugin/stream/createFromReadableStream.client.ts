import type {
  CreateFromReadableStreamFn,
  CreateFromFetchFn,
} from "./createFromReadableStream.types.js";
import { React } from "../vendor/vendor.client.js";
import { ReactDOMClientEdge } from "../vendor/vendorEdge.client.js";
import { assertNonReactServer } from "../config/getCondition.js";

assertNonReactServer();

/**
 * Web-stream counterpart of {@link createFromNodeStream}: decode a Flight RSC
 * payload delivered as a Web `ReadableStream<Uint8Array>` — from
 * renderRscReadableStream / renderRscResponse, an RSC endpoint, an edge worker,
 * or a static `.rsc` fetch — into React elements, via
 * react-server-dom-esm/client.browser. Condition-free and runtime-agnostic
 * (browser / workerd / Deno / Bun): the client transport runs in the consumer's
 * normal React. This is the consumer half a client-first user reaches for —
 * Flight production stays server-only (react-server condition), consumption
 * does not.
 */
export const createFromReadableStream: CreateFromReadableStreamFn =
  function _createFromReadableStreamClient(options) {
    const { rscStream, children, logger, verbose = false } = options;
    let { moduleBaseURL } = options;

    if (children) {
      return { type: "client", children: children as React.ReactElement };
    }
    if (!rscStream) {
      throw new Error(
        "[createFromReadableStream.client] no rscStream nor children provided"
      );
    }
    if (typeof moduleBaseURL !== "string" || !moduleBaseURL) {
      if (verbose) {
        logger?.warn(
          `[createFromReadableStream.client] moduleBaseURL is not a valid string (${JSON.stringify(
            moduleBaseURL
          )}); defaulting to "/"`
        );
      }
      moduleBaseURL = "/";
    }
    if (verbose) {
      logger?.info(
        `[createFromReadableStream.client] decoding Flight ReadableStream via react-server-dom-esm/client.browser, moduleBaseURL: ${moduleBaseURL}`
      );
    }

    // Capture as a non-let const for the closure below.
    const baseURL = moduleBaseURL;
    return {
      type: "client",
      children: React.createElement(() =>
        React.use(
          ReactDOMClientEdge.createFromReadableStream(rscStream, {
            moduleBaseURL: baseURL,
          })
        )
      ),
    };
  };

/**
 * Convenience over {@link createFromReadableStream}: decode a Flight `Response`
 * directly (mirrors react-server-dom-esm/client's `createFromFetch`). Pass the
 * `Response` (or a Promise of one) from fetching an RSC endpoint; the body's
 * Flight stream becomes React elements without the caller touching `.body`.
 */
export const createFromFetch: CreateFromFetchFn =
  function _createFromFetchClient(options) {
    const { response, logger, verbose = false } = options;
    const moduleBaseURL =
      typeof options.moduleBaseURL === "string" && options.moduleBaseURL
        ? options.moduleBaseURL
        : "/";
    if (verbose) {
      logger?.info(
        `[createFromFetch.client] decoding Flight Response via react-server-dom-esm/client.browser, moduleBaseURL: ${moduleBaseURL}`
      );
    }
    return {
      type: "client",
      children: React.createElement(() =>
        React.use(
          ReactDOMClientEdge.createFromFetch(Promise.resolve(response), {
            moduleBaseURL,
          })
        )
      ),
    };
  };
