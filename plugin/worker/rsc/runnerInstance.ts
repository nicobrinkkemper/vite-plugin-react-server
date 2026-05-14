import type { ModuleRunner } from "vite/module-runner";

let runner: ModuleRunner | null = null;

export function setRunner(instance: ModuleRunner): void {
  runner = instance;
}

export function getRunner(): ModuleRunner | null {
  return runner;
}

export function isRunnerEnabled(): boolean {
  return process.env["VPRS_RUNNER"] === "1";
}
