import { createAbsoluteURL, createBaseURL, createPageURL } from "./urls.js";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      VITE_BASE_URL: string;
      VITE_DEV: string;
      VITE_PROD: string;
      VITE_SSR: string;
      VITE_MODE: string;
      VITE_PUBLIC_ORIGIN: string;
    }
  }
}
export const env = () => {
  const {
    VITE_PUBLIC_ORIGIN = "",
    VITE_BASE_URL = "/",
    VITE_SSR = true,
    VITE_DEV = false,
    VITE_PROD = true,
    VITE_MODE = "production",
  } = process.env;
  return {
    PUBLIC_ORIGIN: VITE_PUBLIC_ORIGIN,
    BASE_URL: VITE_BASE_URL,
    SSR: VITE_SSR,
    DEV: VITE_DEV,
    PROD: VITE_PROD,
    MODE: VITE_MODE,
    absoluteUrl: createAbsoluteURL(VITE_BASE_URL, VITE_PUBLIC_ORIGIN),
    baseURL: createBaseURL(VITE_BASE_URL),
    pageURL: createPageURL(VITE_BASE_URL, VITE_PUBLIC_ORIGIN),
  };
};
