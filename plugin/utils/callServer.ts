// @ts-nocheck
import { createFromFetch, encodeReply } from "react-server-dom-esm/client.browser";

type ServerResponse = { returnValue: unknown };

  export const callServer = async (
    id: string,
    args: unknown[]
  ): Promise<unknown> => {
    let baseURL = import.meta.env.BASE_URL
    const response = await createFromFetch(
      fetch(baseURL, {
        method: "POST",
        body: await encodeReply(args),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }),
      { callServer, moduleBaseURL: baseURL }
    );
    const returnValue = (response as ServerResponse).returnValue;
    return returnValue;
  };
  