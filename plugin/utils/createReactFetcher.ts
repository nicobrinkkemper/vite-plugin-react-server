import type { ReactNode } from "react";
// @ts-ignore
import { createFromFetch } from "react-server-dom-esm/client.browser";
import { env } from "./env.js";
import { createPageURL } from "./urls.js";
import { createCallServer } from "./createCallServer.js";

export function createReactFetcher({
  moduleBaseURL = env.BASE_URL,
  publicOrigin = env.PUBLIC_ORIGIN,
  url = window.location.pathname,
  indexRSC = "index.rsc",
  headers = {
    Accept: "text/x-component",
  },
}: {
  url?: string;
  moduleBaseURL?: string;
  publicOrigin?: string;
  indexRSC?: string;
  headers?: HeadersInit;
} = {}): Promise<ReactNode> {
  const parsedURL = createPageURL(moduleBaseURL, publicOrigin, env.DEV)(url, indexRSC);
  return createFromFetch(
    fetch(parsedURL.indexRSC, {
      headers: headers,
    }),
    {
      callServer: createCallServer(parsedURL.moduleBaseURL),
      moduleBaseURL: parsedURL.moduleBaseURL,
    }
  );
}
