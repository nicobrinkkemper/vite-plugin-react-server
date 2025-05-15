import { env } from "./env.client.js";
import { createPageURL } from "./urls.js";

export const pageURL = (url: string) => {
  const { BASE_URL, PUBLIC_ORIGIN } = env();
  return createPageURL(BASE_URL, PUBLIC_ORIGIN)(url);
};
