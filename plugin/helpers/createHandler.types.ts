import type { ReactStreamHandlerFn } from "../types.js";
import type { PassThrough } from "node:stream";

export type CreateHandlerReturn =
  | {
      type: "success";
      stream: PassThrough;
      controller: { abort: (reason: unknown) => void; destroy: () => void };
      error?: never;
    }
  | {
      type: "error";
      error: unknown;
      stream?: never;
      controller?: never;
    };

export type CreateHandlerFn = ReactStreamHandlerFn<
  "url",
  CreateHandlerReturn
>;
