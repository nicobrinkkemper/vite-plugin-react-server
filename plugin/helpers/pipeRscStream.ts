import { Readable } from "node:stream";
import type { Logger } from "vite";

type WebReadableStreamLike = {
  getReader: (...args: any[]) => unknown;
};
type RscStream = NodeJS.ReadableStream | WebReadableStreamLike;

export async function pipeRscStreamToResponse(
  res: any,
  stream: RscStream,
  options?: {
    timeoutMs?: number;
    logger?: Logger;
    timeoutMessage?: string;
    onTimeout?: () => Promise<void> | void;
  }
) {
  if (!res.writable) return;

  if (typeof (stream as NodeJS.ReadableStream).pipe === "function") {
    (stream as NodeJS.ReadableStream).pipe(res);
  } else {
    Readable.fromWeb(stream as any).pipe(res);
  }

  if (!options?.timeoutMs) return;

  let timeout: NodeJS.Timeout | undefined;
  const done = new Promise<void>((resolve) => {
    if (res.writableEnded) {
      resolve();
      return;
    }
    res.once("finish", resolve);
    res.once("close", resolve);
  });

  const timeoutPromise = new Promise<void>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(options.timeoutMessage ?? "RSC Render timeout"));
    }, options.timeoutMs);
  });

  try {
    await Promise.race([done, timeoutPromise]);
  } catch (error) {
    await options.onTimeout?.();
    if (options.logger) {
      options.logger.error(
        options.timeoutMessage ?? "RSC render timeout.",
        error instanceof Error ? { error } : undefined
      );
    }
    if (res.writable) {
      res.end();
    }
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
