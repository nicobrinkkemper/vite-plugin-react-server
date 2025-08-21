import type { CreateFromNodeStreamFn } from "./createFromNodeStream.types.js";
// note: static.node is used here because we need to use the unstable_prerenderToNodeStream function
import { React, ReactDOMServer } from "../vendor/vendor.static.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

/**
 * Server version of createNodeStream.
 *
 * Strategy: In server environment, we convert React elements to RSC streams
 * using ReactDOMServer.unstable_prerenderToNodeStream.
 */
export const createFromNodeStream: CreateFromNodeStreamFn<"server"> =
  function _createFromNodeStreamServer(options) {
    const { model, moduleBasePath = DEFAULT_CONFIG.MODULE_BASE_PATH } = options;

    if (!model) {
      throw new Error(
        "[createFromNodeStream.server] model is required for server version"
      );
    }

    return {
      type: "server" as const,
      children: React.createElement(() =>
        React.use(
          ReactDOMServer.unstable_prerenderToNodeStream(model, moduleBasePath)
        )
      ),
    };
  };
