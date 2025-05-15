import { createAbsoluteURL, createBaseURL, createPageURL } from "./urls.js";
import { env as metaEnv } from "./env.js";
/** Base URL for the application */
export const env = () => {
  const {
    PUBLIC_ORIGIN = metaEnv.PUBLIC_ORIGIN ?? window.location.origin,
    BASE_URL = metaEnv.BASE_URL ?? window.location.pathname,
    SSR = metaEnv.SSR ?? true,
    DEV = metaEnv.DEV ?? false,
    PROD = metaEnv.PROD ?? true,
    MODE = metaEnv.MODE ?? "production",
  } = metaEnv;
  return {
    PUBLIC_ORIGIN,
    BASE_URL,
    SSR,
    DEV,
    PROD,
    MODE,
    absoluteUrl: createAbsoluteURL(BASE_URL, PUBLIC_ORIGIN),
    baseURL: createBaseURL(BASE_URL),
    pageURL: createPageURL(BASE_URL, PUBLIC_ORIGIN),
  };
};
