/**
 * The ambient `process`, or `undefined` on a runtime without one.
 *
 * Config-layer modules ride into baked edge bundles, and several of their
 * probes run at module EVALUATION — a bare `process.*` read there crashes a
 * filesystem-less runtime (Workers, Deno Deploy) even when the surrounding
 * branch is dead on the baked path. Read through this instead.
 *
 * Binding the object once is safe: Node installs `process` at startup and
 * never swaps it, and `proc.env` stays live because it is the same object.
 *
 * Keep this module import-free so the leaf modules that need it stay leaves.
 */
export const proc = (globalThis as { process?: NodeJS.Process }).process;
