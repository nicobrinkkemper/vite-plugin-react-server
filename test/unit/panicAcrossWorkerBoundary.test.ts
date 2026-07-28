import { describe, it, expect } from "vitest";
import { serializeError } from "../../dist/plugin/error/serializeError.js";
import { toError } from "../../dist/plugin/error/toError.js";
import { PANIC_SYMBOL, isPanic } from "../../dist/plugin/error/shouldPanic.js";

/**
 * The panic flag must survive the worker message boundary. Two historical
 * defects, both pinned here:
 * - serializeError read the STRING key "PANIC_SYMBOL" while handleError sets
 *   a Symbol key — the read was always false;
 * - even a Symbol-keyed field on the envelope is dropped by postMessage's
 *   structured clone. The envelope therefore carries a plain `isPanic`, and
 *   toError re-applies the Symbol on rehydration.
 * structuredClone() simulates the postMessage boundary faithfully.
 */
describe("panic flag across the worker boundary", () => {
  it("a panic error round-trips serializeError → structuredClone → toError as panic", () => {
    const err = new Error("boom");
    (err as unknown as Record<symbol, boolean>)[PANIC_SYMBOL] = true;

    const envelope = serializeError(err);
    expect(envelope.isPanic).toBe(true);

    const arrived = structuredClone(envelope);
    // The Symbol key is gone after the clone — only the plain field survives.
    expect((arrived as Record<symbol, unknown>)[PANIC_SYMBOL]).toBeUndefined();

    const rehydrated = toError(arrived);
    expect(isPanic(rehydrated)).toBe(true);
    expect(rehydrated.message).toBe("boom");
  });

  it("a non-panic error round-trips as non-panic", () => {
    const envelope = serializeError(new Error("ordinary"));
    expect(envelope.isPanic).toBe(false);
    const rehydrated = toError(structuredClone(envelope));
    expect(isPanic(rehydrated)).toBe(false);
  });
});
