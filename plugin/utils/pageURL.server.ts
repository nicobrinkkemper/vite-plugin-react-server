import { env } from "./env.server.js";
import { createPageURL } from "./urls.js";

export const pageURL = (path: string) => {
  const { BASE_URL, PUBLIC_ORIGIN } = env();
  return createPageURL(BASE_URL, PUBLIC_ORIGIN)(path);
};
