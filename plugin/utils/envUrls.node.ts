import { createAbsoluteURL, createBaseURL, createPageURL } from "./urls.js";
import { getEnvValue } from "../env/getEnvKey.js";

export const absoluteURL = (path: string) =>
  createAbsoluteURL(
    getEnvValue("BASE_URL") ?? "/",
    getEnvValue("PUBLIC_ORIGIN") ?? ""
  )(path);

export const baseURL = (path: string) =>
  createBaseURL(getEnvValue("BASE_URL") ?? "/")(path);

export const pageURL = (path: string) => {
  const devValue = getEnvValue("DEV");
  const isDev = typeof devValue === "string"
    ? devValue === "true" || devValue === "1"
    : process.env["NODE_ENV"] === "development";
  
  return createPageURL(
    getEnvValue("BASE_URL") ?? "/",
    getEnvValue("PUBLIC_ORIGIN") ?? "",
    isDev
  )(path);
};
