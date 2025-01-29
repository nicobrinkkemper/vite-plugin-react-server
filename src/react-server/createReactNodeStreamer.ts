import React from "react";
import {
  createFromNodeStream,
  type CreateFromNodeStreamOptions,
} from "react-server-dom-esm/client.node";
import type { Readable } from "stream";

export function createReactNodeStreamer({
  stream,
  moduleBasePath,
  moduleBaseURL,
  options,
}: {
  stream: Readable;
  moduleBasePath: string;
  moduleBaseURL: string;
  options?: CreateFromNodeStreamOptions;
}) {
  return createFromNodeStream(
    stream,
    moduleBasePath,
    moduleBaseURL,
    options
  ) as React.Usable<React.ReactNode>;
}
