import type { ReactNode } from "react";
// @ts-ignore
import { createFromFetch } from "react-server-dom-esm/client.browser";
import { callServer } from "./callServer.js";
import { pageURL } from "./pageURL.js";

export function createReactFetcher({
  url = pageURL().pathname,
  moduleBaseURL = new URL(import.meta.env.BASE_URL, window.location.href).href,
  headers = {
    Accept: "text/x-component",
    "Content-Type": "application/json",
  },
}: {
  url?: string;
  moduleBaseURL?: string;
  headers?: HeadersInit;
} = {}): Promise<ReactNode> {
  console.log("createReactFetcher", {url, moduleBaseURL})
  return createFromFetch(
    fetch(url, {
      headers: headers,
    }),
    {
      callServer: callServer,
      moduleBaseURL:moduleBaseURL,
    }
  ) as Promise<ReactNode>;
}
