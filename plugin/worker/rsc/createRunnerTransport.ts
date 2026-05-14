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

export type RpcRequest = {
  __vprs: "rpc-request";
  requestId: number;
  method: string;
  args: unknown[];
};

export type RpcResponse = {
  __vprs: "rpc-response";
  requestId: number;
  result?: unknown;
  error?: { name?: string; message: string; stack?: string };
};

export type RpcInvoker = <T = unknown>(method: string, args: unknown[]) => Promise<T>;

export type RunnerTransportBundle = {
  transport: ModuleRunnerTransport;
  rpc: RpcInvoker;
};

export function createRunnerTransport(port: MessagePort): RunnerTransportBundle {
  let nextRunnerId = 1;
  let nextRpcId = 1;
  const runnerPending = new Map<
    number,
    (value: { result: unknown } | { error: unknown }) => void
  >();
  const rpcPending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: unknown) => void }
  >();

  port.on("message", (msg: RunnerPortResponse | RpcResponse) => {
    if (!msg) return;
    if (msg.__vprs === "runner-response") {
      const resolve = runnerPending.get(msg.requestId);
      if (!resolve) return;
      runnerPending.delete(msg.requestId);
      resolve(msg.result);
    } else if (msg.__vprs === "rpc-response") {
      const pending = rpcPending.get(msg.requestId);
      if (!pending) return;
      rpcPending.delete(msg.requestId);
      if (msg.error) {
        const err = new Error(msg.error.message);
        if (msg.error.name) err.name = msg.error.name;
        if (msg.error.stack) err.stack = msg.error.stack;
        pending.reject(err);
      } else {
        pending.resolve(msg.result);
      }
    }
  });

  const transport: ModuleRunnerTransport = {
    async invoke(payload) {
      return new Promise((resolve) => {
        const requestId = nextRunnerId++;
        runnerPending.set(requestId, resolve as any);
        const req: RunnerPortRequest = {
          __vprs: "runner-request",
          requestId,
          payload,
        };
        port.postMessage(req);
      });
    },
  };

  const rpc: RpcInvoker = async <T = unknown>(
    method: string,
    args: unknown[]
  ): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const requestId = nextRpcId++;
      rpcPending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      const req: RpcRequest = {
        __vprs: "rpc-request",
        requestId,
        method,
        args,
      };
      port.postMessage(req);
    });
  };

  return { transport, rpc };
}
