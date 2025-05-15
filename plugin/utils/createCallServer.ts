import {
  createFromFetch,
  encodeReply,
  // @ts-ignore
} from "react-server-dom-esm/client";

type ServerResponse = { returnValue: unknown };

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
    const returnValue = (response as ServerResponse).returnValue;
    return returnValue;
  };
  return callServer;
};
