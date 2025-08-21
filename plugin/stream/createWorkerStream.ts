import { getCondition } from "../config/getCondition.js";
import type { CreateWorkerStreamFn } from "./createWorkerStream.types.js";

// Use Node.js conditions to determine which implementation to use
const condition = getCondition("");
const dirname = new URL(".", import.meta.url).pathname;

// Dynamically import the appropriate createWorkerStream implementation
export const { createWorkerStream } = (await import(
  `${dirname}/createWorkerStream.${condition}.js`
)) as {
  createWorkerStream: CreateWorkerStreamFn;
};

// Re-export types
export type {
  CreateWorkerStreamFn,
  CreateWorkerStreamOptions,
  ClientWorkerStreamOptions,
  ServerWorkerStreamOptions,
  BaseWorkerStreamOptions,
} from "./createWorkerStream.types.js";

// Legacy export for backward compatibility
export type { WorkerStreamOptions } from "./createWorkerStream.types.js";
