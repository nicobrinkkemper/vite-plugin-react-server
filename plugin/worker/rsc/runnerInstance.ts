import type { ModuleRunner } from "vite/module-runner";
import type { RpcInvoker } from "./createRunnerTransport.js";

let runner: ModuleRunner | null = null;
let rpc: RpcInvoker | null = null;

export function setRunner(instance: ModuleRunner): void {
  runner = instance;
}

export function getRunner(): ModuleRunner | null {
  return runner;
}

export function setRpc(invoker: RpcInvoker): void {
  rpc = invoker;
}

export function getRpc(): RpcInvoker | null {
  return rpc;
}
