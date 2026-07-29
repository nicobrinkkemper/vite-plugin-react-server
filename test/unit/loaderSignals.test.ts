import { describe, expect, it } from "vitest";
import {
  isLoaderSignal,
  isNotFound,
  isRedirect,
  notFound,
  redirect,
} from "../../plugin/router/loaderSignals.js";
import { serializeError } from "../../plugin/error/serializeError.js";
import { toError } from "../../plugin/error/toError.js";

const catchSignal = (fn: () => never): unknown => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("did not throw");
};

describe("loader signals", () => {
  it("redirect() throws an Error carrying to/status", () => {
    const err = catchSignal(() => redirect("/target"));
    expect(isRedirect(err)).toBe(true);
    expect(isNotFound(err)).toBe(false);
    expect((err as { to: string }).to).toBe("/target");
    expect((err as { status: number }).status).toBe(302);
  });

  it("redirect() honors an explicit status", () => {
    const err = catchSignal(() => redirect("/moved", 308));
    expect((err as { status: number }).status).toBe(308);
  });

  it("notFound() throws a marked Error", () => {
    const err = catchSignal(() => notFound());
    expect(isNotFound(err)).toBe(true);
    expect(isRedirect(err)).toBe(false);
    expect(isLoaderSignal(err)).toBe(true);
  });

  it("plain errors are not signals", () => {
    expect(isLoaderSignal(new Error("boom"))).toBe(false);
    expect(isRedirect(null)).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
  });

  it("survives the worker boundary (serializeError → structuredClone → toError)", () => {
    // The exact path a signal takes when a loader throws inside the RSC
    // worker: serialized onto the message envelope, structured-cloned by
    // postMessage, rebuilt by toError on the main thread.
    const original = catchSignal(() => redirect("/after-login", 303));
    const arrived = toError(structuredClone(serializeError(original)));
    expect(isRedirect(arrived)).toBe(true);
    expect((arrived as unknown as { to: string }).to).toBe("/after-login");
    expect((arrived as unknown as { status: number }).status).toBe(303);

    const nf = catchSignal(() => notFound());
    expect(isNotFound(toError(structuredClone(serializeError(nf))))).toBe(true);
  });
});
