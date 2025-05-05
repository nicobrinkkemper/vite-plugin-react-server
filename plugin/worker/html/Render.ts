import { createFromNodeStream } from "react-server-dom-esm/client.node";
import type { HtmlWorkerRenderState } from "./types.js";
import React from "react";
import { PassThrough } from "stream";

if (typeof React.use !== "function") {
  throw new Error("React.use is not a function");
}

export const Render = async (renderState: HtmlWorkerRenderState) => {
  // Create a React element from the RSC stream
  const element = React.use(
    await createFromNodeStream(
      renderState.rscStream,
      renderState.moduleRootPath,
      renderState.moduleBaseURL
    )
  ) as React.ReactElement;

  return element;
};
