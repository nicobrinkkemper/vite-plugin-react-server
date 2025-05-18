import { env } from "./env.js";
import { createAbsoluteURL, createBaseURL, createPageURL } from "./urls.js";

export const absoluteURL = createAbsoluteURL(env.BASE_URL, env.PUBLIC_ORIGIN);
export const baseURL = createBaseURL(env.BASE_URL);
export const pageURL = createPageURL(env.BASE_URL, env.PUBLIC_ORIGIN, env.DEV);
export const { indexRSC: rootIndexRSC, moduleBaseURL } = pageURL("/");
export const { BASE_URL: baseUrl, PUBLIC_ORIGIN: publicOrigin } = env;
