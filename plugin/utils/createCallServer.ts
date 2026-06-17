// The browser flight client is imported lazily, at call time, so this module is
// import-safe under the `react-server` condition (importing it statically would
// pull react-dom/client into the server graph). callServer only ever runs in the
// browser, where the dynamic import resolves from the module cache.

export const createCallServer = (moduleBaseURL: string) => {
  const callServer = async (id: string, args: unknown[]) => {
    const { createFromFetch, encodeReply } = await import(
      "react-server-dom-esm/client.browser"
    );
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
      const serverResponse = response;
      return serverResponse.returnValue;
    }

    return response;
  };
  return callServer;
};
