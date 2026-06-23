// React types resolve from the vendor system at runtime; React.* is the global
// namespace (mirrors createFromNodeStream.types.ts).
import type { Logger } from "vite";

/**
 * Options for decoding a Flight RSC payload delivered as a Web stream into
 * React elements (client-only: producing Flight stays server-only).
 */
export type CreateFromReadableStreamOptions = {
  /** Pre-resolved elements: short-circuit decode (mirrors createFromNodeStream). */
  children?: any;
  /** The Flight RSC payload as a Web ReadableStream (the edge producer's output). */
  rscStream?: ReadableStream<Uint8Array>;
  /** Base URL the client transport uses to resolve client-reference modules. */
  moduleBaseURL?: string;
  logger?: Logger;
  verbose?: boolean;
};

/**
 * Options for {@link CreateFromFetchFn}: decode a Flight `Response` directly.
 */
export type CreateFromFetchOptions = {
  /** A fetch Response (or a Promise of one) whose body is a Flight RSC payload. */
  response: Response | Promise<Response>;
  moduleBaseURL?: string;
  logger?: Logger;
  verbose?: boolean;
};

/** Result of decoding a Flight Web stream: a client-typed React element. */
export interface FromReadableStreamResult {
  type: "client";
  children: React.ReactElement;
}

export type CreateFromReadableStreamFn = (
  options: CreateFromReadableStreamOptions
) => FromReadableStreamResult;

export type CreateFromFetchFn = (
  options: CreateFromFetchOptions
) => FromReadableStreamResult;
