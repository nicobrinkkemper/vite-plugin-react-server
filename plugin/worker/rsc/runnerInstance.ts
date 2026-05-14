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

/**
 * The Vite ModuleRunner path is enabled by default. Set `VPRS_RUNNER=0`
 * to fall back to the legacy Node-import-based loader if the runner
 * ever causes problems for a specific project.
 */
export function isRunnerEnabled(): boolean {
  return process.env["VPRS_RUNNER"] !== "0";
}
