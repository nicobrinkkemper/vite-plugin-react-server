// @ts-nocheck
import { createFromFetch, encodeReply } from "react-server-dom-esm/client.browser";
import { env } from "./env.js";

type ServerResponse = { returnValue: unknown };

export const callServer = async (
  id: string,
  args: unknown[]
): Promise<unknown> => {
  // @vite-ignore
  const response = await createFromFetch(
    fetch(env.BASE_URL, {
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
  