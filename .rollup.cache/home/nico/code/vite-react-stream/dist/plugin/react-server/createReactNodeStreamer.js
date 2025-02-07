import React from "react";
import { createFromNodeStream,
// @ts-ignore
 } from "react-server-dom-esm/client.node";
export function createReactNodeStreamer({ stream, moduleBasePath, moduleBaseURL, options, }) {
    return createFromNodeStream(stream, moduleBasePath, moduleBaseURL, options);
}
//# sourceMappingURL=createReactNodeStreamer.js.map