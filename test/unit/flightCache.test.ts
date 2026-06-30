import { describe, expect, it, vi } from "vitest";
import { createFlightCache } from "../../plugin/router/flightCache.js";

describe("createFlightCache", () => {
  it("dedupes concurrent gets for the same url", async () => {
    const cache = createFlightCache<string>();
    const fetcher = vi.fn(async (u: string) => `flight:${u}`);
    const [a, b] = await Promise.all([
      cache.get("/a", { fetcher }),
      cache.get("/a", { fetcher }),
    ]);
    expect(a).toBe("flight:/a");
    expect(b).toBe("flight:/a");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("prefetch warms an entry that a later get reuses", async () => {
    const cache = createFlightCache<string>();
    const fetcher = vi.fn(async (u: string) => `flight:${u}`);
    cache.prefetch("/a", { fetcher });
    expect(cache.has("/a")).toBe(true);
    await cache.get("/a", { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("caches indefinitely with no ttl (static routes)", async () => {
    let t = 0;
    const cache = createFlightCache<string>({ now: () => t });
    const fetcher = vi.fn(async (u: string) => `flight:${u}`);
    await cache.get("/a", { fetcher });
    t = 10_000_000;
    await cache.get("/a", { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches after ttl expires (dynamic-route snapshots)", async () => {
    let t = 0;
    const cache = createFlightCache<string>({ now: () => t });
    const fetcher = vi.fn(async (u: string) => `flight:${u}`);
    await cache.get("/a", { fetcher, ttlMs: 1000 });
    t = 500;
    await cache.get("/a", { fetcher, ttlMs: 1000 }); // still fresh
    expect(fetcher).toHaveBeenCalledTimes(1);
    t = 1500;
    await cache.get("/a", { fetcher, ttlMs: 1000 }); // expired
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("evicts a rejected fetch so it can be retried", async () => {
    const cache = createFlightCache<string>();
    const failing = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(cache.get("/a", { fetcher: failing })).rejects.toThrow("boom");
    // allow the catch handler to run
    await Promise.resolve();
    expect(cache.has("/a")).toBe(false);
    const ok = vi.fn(async () => "recovered");
    await expect(cache.get("/a", { fetcher: ok })).resolves.toBe("recovered");
  });

  it("invalidate() drops one url or clears all", async () => {
    const cache = createFlightCache<string>();
    const fetcher = async (u: string) => `flight:${u}`;
    await cache.get("/a", { fetcher });
    await cache.get("/b", { fetcher });
    cache.invalidate("/a");
    expect(cache.has("/a")).toBe(false);
    expect(cache.has("/b")).toBe(true);
    cache.invalidate();
    expect(cache.has("/b")).toBe(false);
  });
});
