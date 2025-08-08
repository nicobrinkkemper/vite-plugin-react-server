import {
  createFromFetch,
  encodeReply,
} from "react-server-dom-esm/client.browser";

type ServerActionResponse<R> = {
  returnValue: R;
  type: 'server-action-response';
  error?: string;
}

export const createCallServer = <R>(moduleBaseURL: string) => {
  const callServer = async (id: string, args: unknown[]): Promise<R> => {
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
      const serverResponse = response as unknown as ServerActionResponse<R>;
      if (serverResponse.error) {
        throw new Error(serverResponse.error);
      }
      return serverResponse.returnValue;
    }
    
    return response;
  };
  return callServer;
};
