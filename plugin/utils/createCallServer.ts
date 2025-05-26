import {
  createFromFetch,
  encodeReply,
} from "react-server-dom-esm/client.browser";

interface ServerActionResponse {
  returnValue: unknown;
  type: 'server-action-response';
}

export const createCallServer = (moduleBaseURL: string) => {
  const callServer = async (_id: string, args: unknown[]): Promise<unknown> => {
    const response = await createFromFetch(
      fetch(moduleBaseURL, {
        method: "POST",
        body: await encodeReply(args),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }),
      { callServer, moduleBaseURL }
    );
    
    // Check if this is a server action response
    if (response && typeof response === 'object' && 'returnValue' in response) {
      return (response as ServerActionResponse).returnValue;
    }
    
    return response;
  };
  return callServer;
};
