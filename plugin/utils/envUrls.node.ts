import { createAbsoluteURL, createBaseURL, createPageURL } from "./urls.js";

export const absoluteURL = (path: string) =>
  createAbsoluteURL(
    process.env.VITE_BASE_URL ?? "/",
    process.env.VITE_PUBLIC_ORIGIN ?? ""
  )(path);

export const baseURL = (path: string) =>
  createBaseURL(process.env.VITE_BASE_URL ?? "/")(path);

export const pageURL = (path: string) =>
  createPageURL(
    process.env.VITE_BASE_URL ?? "/",
    process.env.VITE_PUBLIC_ORIGIN ?? "",
    typeof process.env.VITE_DEV === "string"
      ? process.env.VITE_DEV === "true" || process.env.VITE_DEV === "1"
      : process.env["NODE_ENV"] === "development"
  )(path);
