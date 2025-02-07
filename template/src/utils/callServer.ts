import ReactDOMESM from "react-server-dom-esm/client.browser";
  
  type ServerResponse = { returnValue: unknown };
  
  const host = "";
  const moduleBaseURL = host + "/src";

  export const callServer = async (
    id: string,
    args: unknown[]
  ): Promise<unknown> => {
    console.log("Fetching", id);
    const response = await ReactDOMESM.createFromFetch(
      fetch(host, {
        method: "POST",
        body: await ReactDOMESM.encodeReply(args),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }),
      { callServer, moduleBaseURL: moduleBaseURL }
    );
    const returnValue = (response as ServerResponse).returnValue;
    return returnValue;
  };
  