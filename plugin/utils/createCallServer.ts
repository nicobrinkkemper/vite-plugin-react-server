import {
  createFromFetch,
  encodeReply,
} from "react-server-dom-esm/client.browser";

interface ServerActionResponse {
  returnValue: unknown;
  type: 'server-action-response';
}

export const createCallServer = (moduleBaseURL: string) => {
  const callServer = async (id: string, args: unknown[]): Promise<unknown> => {
    const response = await createFromFetch(
      fetch(moduleBaseURL, {
        method: "POST",
        body: await encodeReply({
          id,
          args
        }),
        headers: {
          Accept: "text/x-component",
        },
      }),
      { callServer, moduleBaseURL }
    );
    
    // Check if this is a server action response
    if (response && typeof response === 'object' && 'returnValue' in response) {
      const serverResponse = response as ServerActionResponse;
      const returnValue = serverResponse.returnValue as any;
      if (returnValue && returnValue.success === false && returnValue.error) {
        throw new Error(returnValue.error);
      }
      return serverResponse.returnValue;
    }
    
    return response;
  };
  return callServer;
};
