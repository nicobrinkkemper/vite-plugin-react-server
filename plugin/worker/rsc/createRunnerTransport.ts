import type { MessagePort } from "node:worker_threads";
import type { ModuleRunnerTransport } from "vite/module-runner";

export type RunnerPortRequest = {
  __vprs: "runner-request";
  requestId: number;
  payload: unknown;
};

export type RunnerPortResponse = {
  __vprs: "runner-response";
  requestId: number;
  result: { result: unknown } | { error: unknown };
};

export function createRunnerTransport(port: MessagePort): ModuleRunnerTransport {
  let nextId = 1;
  const pending = new Map<
    number,
    (value: { result: unknown } | { error: unknown }) => void
  >();

  port.on("message", (msg: RunnerPortResponse) => {
    if (!msg || msg.__vprs !== "runner-response") return;
    const resolve = pending.get(msg.requestId);
    if (!resolve) return;
    pending.delete(msg.requestId);
    resolve(msg.result);
  });

  return {
    async invoke(payload) {
      return new Promise((resolve) => {
        const requestId = nextId++;
        pending.set(requestId, resolve as any);
        const req: RunnerPortRequest = {
          __vprs: "runner-request",
          requestId,
          payload,
        };
        port.postMessage(req);
      });
    },
  };
}
