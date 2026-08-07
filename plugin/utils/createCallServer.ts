// The browser flight client is imported lazily, at call time, so this module is
// import-safe under the `react-server` condition (importing it statically would
// pull react-dom/client into the server graph). callServer only ever runs in the
// browser, where the dynamic import resolves from the module cache.
//
// The client is CHOSEN per transport (loadBrowserFlightClient): under
// transport:"webpack" the action response is webpack-flavored, and the esm
// decoder mis-reads webpack reference rows — the export-name slot receives the
// chunk array, so components resolve to undefined. Arg encoding (encodeReply)
// follows the same flavor for symmetry with the server's decodeReply.

import { loadBrowserFlightClient } from "./flightClient.browser.js";

export const createCallServer = (moduleBaseURL: string) => {
  const callServer = async (id: string, args: unknown[]) => {
    const { createFromFetch, encodeReply } = await loadBrowserFlightClient();
    const response = await createFromFetch(
      fetch(moduleBaseURL, {
        method: "POST",
        body: await encodeReply(args),
        headers: {
          Accept: "text/x-component",
          "x-rsc-action": id,
        },
      }),
      { callServer, moduleBaseURL }
    );

    // Check if this is a server action response
    if (response && typeof response === "object" && "returnValue" in response) {
      const serverResponse = response as { returnValue: unknown };
      return serverResponse.returnValue;
    }

    return response;
  };
  return callServer;
};
