// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFlightCache } from "../../plugin/router/flightCache.js";
import { createRouter } from "../../plugin/router/createRouter.js";

beforeEach(() => {
  history.replaceState(null, "", "/");
});

describe("createRouter", () => {
  it("starts at the current location", () => {
    history.replaceState(null, "", "/start");
    const r = createRouter({ fetchFlight: async (u) => u });
    expect(r.getState().url).toBe("/start");
  });

  it("navigate pushes history, warms the flight, and notifies", async () => {
    const fetchFlight = vi.fn(async (u: string) => `flight:${u}`);
    const r = createRouter({ fetchFlight });
    const seen: string[] = [];
    r.subscribe(() => seen.push(r.getState().url));

    r.navigate("/profile/1");
    expect(location.pathname).toBe("/profile/1");
    expect(r.getState().url).toBe("/profile/1");
    expect(seen).toEqual(["/profile/1"]);
    expect(fetchFlight).toHaveBeenCalledWith("/profile/1");

    // the warmed flight is reused (no second fetch)
    await r.flight("/profile/1");
    expect(fetchFlight).toHaveBeenCalledTimes(1);
  });

  it("reuses a prefetched flight on navigate (one fetch total)", async () => {
    const fetchFlight = vi.fn(async (u: string) => `flight:${u}`);
    const r = createRouter({ fetchFlight });
    r.prefetch("/profile/2");
    r.navigate("/profile/2");
    await r.flight("/profile/2");
    expect(fetchFlight).toHaveBeenCalledTimes(1);
  });

  it("updates state on popstate (back/forward)", () => {
    const r = createRouter({ fetchFlight: async (u) => u });
    const seen: string[] = [];
    r.subscribe(() => seen.push(r.getState().url));
    r.navigate("/a");
    history.replaceState(null, "", "/b"); // simulate the browser moving location
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(r.getState().url).toBe("/b");
    expect(seen).toEqual(["/a", "/b"]);
  });

  it("unsubscribe stops notifications", () => {
    const r = createRouter({ fetchFlight: async (u) => u });
    const cb = vi.fn();
    const off = r.subscribe(cb);
    r.navigate("/x");
    off();
    r.navigate("/y");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("gives dynamic-route flights a short ttl; static ones cache forever", async () => {
    let t = 0;
    const cache = createFlightCache<string>({ now: () => t });
    const fetchFlight = vi.fn(async (u: string) => u);
    const r = createRouter({
      fetchFlight,
      isDynamic: (u) => u.startsWith("/p/"),
      dynamicTtlMs: 1000,
      cache,
    });

    await r.flight("/static"); // #1 (no ttl)
    await r.flight("/p/1"); // #2 (dynamic, ttl 1000)
    expect(fetchFlight).toHaveBeenCalledTimes(2);

    t = 500;
    await r.flight("/p/1"); // fresh → reused
    expect(fetchFlight).toHaveBeenCalledTimes(2);

    t = 1500;
    await r.flight("/p/1"); // #3 (expired)
    expect(fetchFlight).toHaveBeenCalledTimes(3);

    t = 9_999_999;
    await r.flight("/static"); // still reused (no ttl)
    expect(fetchFlight).toHaveBeenCalledTimes(3);
  });
});
