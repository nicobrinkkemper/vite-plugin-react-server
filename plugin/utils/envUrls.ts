import { env } from "#env";
import { createAbsoluteURL, createBaseURL, createPageURL } from "./urls.js";

// Env-bound URL helpers. The browser/Node split lives entirely in `#env`
// (package.json `imports`): the browser build resolves it to baked
// `import.meta.env` values, Node/SSG/edge to `process.env`. Here we just read
// the resolved values — no runtime environment detection, no `import.meta.env`.
const meta = env as {
  BASE_URL?: string;
  PUBLIC_ORIGIN?: string;
  DEV?: boolean | string;
  MODE?: string;
};

const base = (): string => meta.BASE_URL ?? "/";
const origin = (): string => meta.PUBLIC_ORIGIN ?? "";

export const absoluteURL = (path: string) =>
  createAbsoluteURL(base(), origin())(path);

export const baseURL = (path: string) => createBaseURL(base())(path);

export const pageURL = (path: string) => {
  const isDev = meta.DEV === true || meta.DEV === "true" || meta.MODE === "development";
  return createPageURL(base(), origin(), isDev)(path);
};
