import type { MessagePort } from "node:worker_threads";

/**
 * Type-safe helper to set max listeners on MessagePort.
 * 
 * MessagePort extends EventTarget (at runtime), which has setMaxListeners.
 * However, the TypeScript types don't reflect this, so we use a type assertion.
 * This is safe because MessagePort is an EventTarget at runtime in Node.js.
 */
export function setMaxListenersOnPort(
  port: MessagePort,
  maxListeners: number
): void {
  // MessagePort extends EventTarget at runtime, which has setMaxListeners
  // TypeScript types don't expose this, so we use a type assertion
  // This is safe because all MessagePort instances have setMaxListeners in Node.js
  (port as unknown as { setMaxListeners: (n: number) => void }).setMaxListeners(maxListeners);
}

/**
 * Unref a MessagePort so it doesn't keep the event loop alive.
 * Always unref ports — only active message listeners should keep the process alive,
 * not the port's existence.
 */
export function unrefPort(port: MessagePort): void {
  if (typeof (port as any).unref === "function") {
    (port as any).unref();
  }
}

