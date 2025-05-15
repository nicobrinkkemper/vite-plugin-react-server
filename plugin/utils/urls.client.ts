import { env } from "./env.client.js";
import { createBaseURL } from "./urls.js";
import { createAbsoluteURL } from "./urls.js";

/** 
 * Returns the absolute URL for a given path, using the baseURL and publicOrigin settings.
 *
 * ```ts
 * const url = absoluteUrl("/test")
 * console.log(url) // "http://localhost:3000/test"
 * ``` 
 * 
 * Note: this is the clientSide version of absoluteUrl, which uses the BASE_URL and PUBLIC_ORIGIN
 * variables from the env.client.js file.
 * 
 * @param path - The path to get the absolute URL for
 * @returns The absolute URL for the given path
 */
export const absoluteUrl = (path: string) => {
  const { BASE_URL, PUBLIC_ORIGIN } = env();
  return createAbsoluteURL(BASE_URL, PUBLIC_ORIGIN)(path);
};

/** 
 * This function takes a path and returns the path with the baseURL attached to it.
 *
 * ```ts
 * const url = absoluteUrl("/test")
 * console.log(url) // "http://localhost:3000/test"
 * ```
 * 
 * Note: this is the clientSide version of baseURL, which uses import.meta.env
 * 
 * @param path - The path to get the baseURL for
 * @returns The baseURL for the given path
 */
export const baseURL = (path: string) => {
  const { BASE_URL } = env();
  return createBaseURL(BASE_URL)(path);
};
