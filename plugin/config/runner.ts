// Note: do not import Node-only modules here. Like getCondition.ts, this file
// is consumed in both server and client plugin contexts.

import { getCondition, REACT_CONDITION } from "./getCondition.js";

/**
 * The execution paradigms a consumer can declare. See
 * docs/internals/runner-spec.md: the runner replaces the process condition as
 * API dispatch, never as react-server resolution.
 */
export const RUNNER_NAMES = ["main", "isolated", "edge"] as const;
export type RunnerName = (typeof RUNNER_NAMES)[number];

const RUNNER_PITCH: Record<RunnerName, string> = {
  main: "react-server on the main thread; best stack traces, React usable in vite.config.ts; requires NODE_OPTIONS='--conditions react-server'",
  isolated:
    "worker_threads rsc-worker owns react-server resolution; no process flag",
  edge: "single isolate, React baked per environment at build time; Web streams, no process flag",
};

const runnerList = (): string =>
  RUNNER_NAMES.map((name) => `  - "${name}": ${RUNNER_PITCH[name]}`).join("\n");

/**
 * The runner/condition invariant, validated at config-resolve time (the flag
 * names an intent; the process either matches it or the build says so loudly):
 *
 * - `main` requires the process condition present — the flag cannot
 *   retroactively add `--conditions react-server` to imports that already
 *   resolved (vite.config.ts and its graph load before any plugin code runs).
 * - `isolated` / `edge` require the condition absent — a global
 *   `--conditions react-server` poisons every module the orchestrator loads
 *   outside its per-environment `resolve.conditions`.
 *
 * Returns the validated runner, or undefined when none was declared (the
 * legacy condition-inferred dispatch; a declared runner becomes required in
 * the next major).
 */
export function validateRunner(runner: unknown): RunnerName | undefined {
  if (runner === undefined || runner === null) return undefined;
  if (!RUNNER_NAMES.includes(runner as RunnerName)) {
    throw new Error(
      `[vite-plugin-react-server] Unknown runner ${JSON.stringify(runner)}. Pick one:\n${runnerList()}`
    );
  }
  const name = runner as RunnerName;
  const conditionPresent = getCondition() === REACT_CONDITION.server;
  if (name === "main" && !conditionPresent) {
    throw new Error(
      "[vite-plugin-react-server] runner 'main' needs NODE_OPTIONS='--conditions react-server' (react-in-config resolves at process start)."
    );
  }
  if (name !== "main" && conditionPresent) {
    throw new Error(
      `[vite-plugin-react-server] runner '${name}' owns react-server resolution itself; remove the process flag.`
    );
  }
  if (name === "edge") {
    throw new Error(
      "[vite-plugin-react-server] runner 'edge' is not implemented yet — use runner 'isolated' (or 'main') with build.edge to emit the baked pair meanwhile."
    );
  }
  return name;
}
