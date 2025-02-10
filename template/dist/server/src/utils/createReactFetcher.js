import ReactDOMESM from "react-server-dom-esm/client.browser";
import { callServer } from "./callServer.js";
function createReactFetcher({
  url = window.location.pathname,
  moduleBaseURL = "/src",
  headers = { Accept: "text/x-component" }
} = {}) {
  return ReactDOMESM.createFromFetch(
    fetch(url, {
      headers
    }),
    {
      callServer,
      moduleBaseURL: new URL(moduleBaseURL, window.origin).href
    }
  );
}
export {
  createReactFetcher
};
