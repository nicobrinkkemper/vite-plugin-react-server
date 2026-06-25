import type { RenderFlightToHtmlFn } from "./renderFlightToHtml.types.js";
import { React, ReactDOMHtmlServerEdge } from "../vendor/vendor.client.js";
import { ReactDOMClientEdge } from "../vendor/vendorEdge.client.js";
import { assertNonReactServer } from "../config/getCondition.js";

assertNonReactServer();

/**
 * Single-isolate flash-free HTML: decode a Flight RSC `ReadableStream` and
 * render it straight to an HTML `ReadableStream` in the SAME process — no
 * worker_threads, no `--conditions` flip.
 *
 * This is the in-process counterpart of the worker-based HTML render
 * (plugin/worker/html). It works because, in a single-isolate build, the rsc
 * bundle bakes server React and the ssr bundle bakes client React, so the two
 * graphs co-exist; client islands resolve via the client transport's native
 * `import(moduleBaseURL + id)` into the ssr bundle (point `moduleBaseURL` there)
 * with no condition-sensitive resolution. Web-streams only — edge-safe.
 *
 * Producing the Flight stays server-only (react-server condition); this is the
 * consumption + HTML render half, so it runs under the client renderer and
 * guards against being evaluated on the wrong side.
 */
export const renderFlightToHtml: RenderFlightToHtmlFn =
  async function _renderFlightToHtml(options) {
    const {
      rscStream,
      moduleBaseURL,
      bootstrapModules,
      bootstrapScriptContent,
      nonce,
      onError,
      signal,
      logger,
      verbose = false,
    } = options;

    if (!rscStream) {
      throw new Error("[renderFlightToHtml] rscStream is required");
    }

    // Decode the Flight payload ONCE into a stable promise. A Web ReadableStream
    // can only be read by a single reader, and the streaming HTML render may
    // re-invoke its component on retry — so the decode must NOT live inside the
    // rendered component (that re-reads a locked stream). Decode here, React.use
    // the stable promise inside Root.
    const elementPromise = ReactDOMClientEdge.createFromReadableStream(rscStream, {
      moduleBaseURL: moduleBaseURL || "/",
    });

    if (verbose) {
      logger?.info(
        `[renderFlightToHtml] rendering decoded Flight to HTML via react-dom/server.edge, moduleBaseURL: ${moduleBaseURL}`
      );
    }

    function Root(): React.ReactNode {
      return React.use(elementPromise);
    }

    return ReactDOMHtmlServerEdge.renderToReadableStream(
      React.createElement(
        React.Suspense,
        null,
        React.createElement(Root)
      ),
      { bootstrapModules, bootstrapScriptContent, nonce, onError, signal }
    );
  };
