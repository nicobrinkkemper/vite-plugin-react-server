import {
  createBaseURL,
  createAbsoluteURL,
  createPageURL,
} from "./urls.js";
import { env } from "./env.server.js";
/**
 * Returns the absolute URL for a given path, using the baseURL and publicOrigin settings.
 *
 * ```ts
 * const url = absoluteUrl("/test")
 * console.log(url) // "http://localhost:3000/test"
 * ```
 *
 * Note: this is the serverSide version of absoluteUrl, which uses dynamic runtime
 * values of process.env to get the variables.
 * @TODO: Support vitePrefix setting (only VITE_ prefixed variables are supported for now)
 *
 * @param path - The path to get the absolute URL for
 * @returns The absolute URL for the given path
 */
export const absoluteUrl = (path: string) => {
  const { BASE_URL, PUBLIC_ORIGIN } = env();
  return createAbsoluteURL(BASE_URL, PUBLIC_ORIGIN)(path);
};

/**
 * Returns the baseURL for a given path, using the baseURL setting.
 *
 * ```ts
 * const baseURL = baseURL("/test")
 * console.log(baseURL) // "http://localhost:3000/test"
 * ```
 *
 * Note: this is the serverSide version of baseURL, which uses dynamic runtime values
 * of process.env to get the variables.
 * @TODO: Support vitePrefix setting (only VITE_ prefixed variables are supported for now)
 *
 * @param path - The path to get the baseURL for
 * @returns The baseURL for the given path
 */
export const baseURL = (path: string) => {
  const { BASE_URL } = env();
  return createBaseURL(BASE_URL)(path);
};

/**
 * Returns the pageURL for a given path, using the baseURL and publicOrigin settings.
 *
 * ```ts
 * const pageURL = pageURL("/test")
 * console.log(pageURL) // "http://localhost:3000/test"
 * ```
 *
 * @param path - The path to get the pageURL for
 * @returns The pageURL for the given path
 */
export const pageURL = (path: string) => {
  const { BASE_URL, PUBLIC_ORIGIN } = env();
  return createPageURL(BASE_URL, PUBLIC_ORIGIN)(path);
};
