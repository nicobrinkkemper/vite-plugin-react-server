import { createFromFetch } from "react-server-dom-esm/client.browser";
import { createCallServer } from "./createCallServer.js";
import { env } from "./env.js";
import { createPageURL } from "./urls.js";

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
} = {}) {
  const parsedURL = createPageURL(
    moduleBaseURL,
    publicOrigin,
    env.DEV
  )(url, indexRSC);
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
