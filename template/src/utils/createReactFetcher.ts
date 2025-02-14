import type { ReactNode } from "react";
// @ts-ignore
import ReactDOMESM from "react-server-dom-esm/client.browser";
import { callServer } from "./callServer.js";

export function createReactFetcher({
  url = window.location.pathname,
  moduleBaseURL = "/src",
  headers = { Accept: "text/x-component" },
}: {
  url?: string;
  moduleBaseURL?: string;
  headers?: HeadersInit;
} = {}): Promise<ReactNode> {
  return ReactDOMESM.createFromFetch(
    fetch(url, {
      headers: headers,
    }),
    {
      callServer: callServer,
      moduleBaseURL: new URL(moduleBaseURL, window.origin).href,
    }
  ) as Promise<ReactNode>;
}
