import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// Straight off dist like the worker tests: the utils barrel is condition-split
// and this browser-side helper isn't reachable through the server barrel.
import { hydrateOrRender } from "../../dist/plugin/utils/hydrateOrRender.js";

/**
 * The default onError wording contract (user report, 2026-07-28):
 * - a document being navigated away from (reload interrupting a reload) gets
 *   its in-flight loads aborted — say it was ABORTED, as info, not an error;
 * - a genuine initial-payload failure logs an error that says what the page
 *   will do (stay server-rendered, links full-page), replacing the old
 *   "staying static" wording.
 */
describe("hydrateOrRender default onError", () => {
  let pagehide: (() => void) | undefined;
  const fakeRoot = { hasChildNodes: () => true } as unknown as Element;

  beforeEach(() => {
    pagehide = undefined;
    (globalThis as { window?: unknown }).window = {
      addEventListener: (ev: string, fn: () => void) => {
        if (ev === "pagehide") pagehide = fn;
      },
    };
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  const flush = () => new Promise((r) => setTimeout(r, 50));

  it("says ABORTED (info, not error) when the document departed before settling", async () => {
    hydrateOrRender(fakeRoot, () => Promise.reject(new Error("aborted import")));
    pagehide?.(); // the navigation-away happens before the rejection lands
    await flush();
    expect(console.error).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(console.info).mock.calls[0][0])).toMatch(/aborted/i);
  });

  it("logs a real error (with the new wording) when the document stayed", async () => {
    hydrateOrRender(fakeRoot, () => Promise.reject(new Error("server down")));
    await flush();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
    const msg = String(vi.mocked(console.error).mock.calls[0][0]);
    expect(msg).toMatch(/could not load the initial payload/);
    expect(msg).not.toMatch(/staying static/);
  });

  it("a custom onError overrides the default entirely", async () => {
    const onError = vi.fn();
    hydrateOrRender(fakeRoot, () => Promise.reject(new Error("x")), { onError });
    pagehide?.();
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(console.info).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
