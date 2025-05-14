import type { ReactNode } from "react";
// @ts-ignore
import { createFromFetch } from "react-server-dom-esm/client.browser";
import { callServer } from "./callServer.js";
import { pageURL } from "./pageURL.js";
import { env } from "./env.js";

export function createReactFetcher({
  moduleBaseURL = env.BASE_URL,
  url,
  headers = {
    Accept: "text/x-component",
  },
}: {
  url?: string;
  moduleBaseURL?: string;
  headers?: HeadersInit;
} = {}): Promise<ReactNode> {
  const parsedURL = pageURL(moduleBaseURL, url);
  return createFromFetch(
    fetch(parsedURL.indexRSC, {
      headers: headers,
    }),
    {
      callServer: callServer,
      moduleBaseURL: parsedURL.moduleBaseURL,
    }
  ) as Promise<ReactNode>;
}
