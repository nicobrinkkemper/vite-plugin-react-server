import type { RenderFlightToHtmlFn } from "./renderFlightToHtml.types.js";
import { React, ReactDOMHtmlServerEdge } from "../vendor/vendor.client.js";
import { ReactDOMClientEdge } from "../vendor/vendorEdge.client.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { createPassthroughConsumerManifest } from "./webpackConsumerManifest.js";

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
/**
 * Webpack-transport decode: the flight encodes baked-manifest ids, so chunk
 * loads resolve as `import(moduleBaseURL + chunk)` and the module map merely
 * echoes ids through — the payload never composes a module path itself.
 * Installed once per process (the runtime's globals are process-wide by the
 * transport's design); everything webpack-flavored is lazy-imported so
 * esm-transport users pay nothing for this branch.
 */
type WebpackDecode = (stream: ReadableStream<Uint8Array>) => Promise<unknown>;
// Memoized PER moduleBaseURL: a first-call-wins memo would silently resolve a
// second bundle's chunks against the first bundle's base. The runtime's
// globals merge on reinstall (loaders accumulate; a loader whose base 404s
// falls through to the next), so multiple bases in one process compose.
const webpackDecodeByBase = new Map<string, Promise<WebpackDecode>>();
function getWebpackDecode(
  moduleBaseURL: string
): Promise<WebpackDecode> {
  const memo = webpackDecodeByBase.get(moduleBaseURL);
  if (memo) return memo;
  const ready = Promise.all([
    import("react-server-loader/webpack/client.edge"),
    import("react-server-loader/webpack/runtime"),
  ]).then(([clientEdge, runtime]) => {
    runtime.installWebpackGlobals({
      load: (chunkId: string) =>
        import(
          /* @vite-ignore */ new URL(chunkId.replace(/^\//, ""), moduleBaseURL)
            .href
        ),
    });
    // Pass-through manifest (shared with the baked consumer — see
    // webpackConsumerManifest.ts): the module's own id is its only chunk. The
    // payload's chunk closure names BROWSER-tree files (that's who preloads
    // them), while this decode imports off the ssr tree (moduleBaseURL), where
    // `import()` resolves the module's relative imports transitively — the
    // closure would name files that don't exist here.
    const serverConsumerManifest = createPassthroughConsumerManifest();
    return ((stream) =>
      clientEdge.createFromReadableStream(stream, {
        serverConsumerManifest,
      })) as WebpackDecode;
  });
  webpackDecodeByBase.set(moduleBaseURL, ready);
  return ready;
}

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
      flightTransport = "esm",
    } = options;

    if (!rscStream) {
      throw new Error("[renderFlightToHtml] rscStream is required");
    }

    // Decode the Flight payload ONCE into a stable promise. A Web ReadableStream
    // can only be read by a single reader, and the streaming HTML render may
    // re-invoke its component on retry — so the decode must NOT live inside the
    // rendered component (that re-reads a locked stream). Decode here, React.use
    // the stable promise inside Root.
    const elementPromise =
      flightTransport === "webpack"
        ? ((await getWebpackDecode(moduleBaseURL || "/"))(
            rscStream
          ) as Promise<React.ReactNode>)
        : ReactDOMClientEdge.createFromReadableStream(rscStream, {
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
