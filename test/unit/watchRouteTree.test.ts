import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyAutoDiscoveredFiles, watchRouteTree } from "../../plugin/dev-server/devPluginShared.js";

/** A route table whose next rescan finds what `change()` queued. */
function fakeTree() {
  let version = 0;
  let changes = 0;
  let scanError: Error | undefined;
  return {
    isRouteFile: (file: string) => file.endsWith("page.tsx"),
    rescan() {
      if (scanError) throw scanError;
      const routeSetChanged = changes > 0;
      if (routeSetChanged) version++;
      changes = 0;
      return { routeSetChanged };
    },
    routeSetVersion: () => version,
    change: () => void changes++,
    rejectScans: (error: Error) => void (scanError = error),
  };
}

function fakeServer(http = true) {
  const watcher = new EventEmitter();
  const httpServer = http ? new EventEmitter() : null;
  const logger = { info: vi.fn(), error: vi.fn() };
  const restart = vi.fn(() => Promise.resolve());
  return { watcher, httpServer, restart, config: { logger } };
}

function watch(server: ReturnType<typeof fakeServer>, routeTree: ReturnType<typeof fakeTree>) {
  watchRouteTree(server, {
    routeTree,
    autoDiscoveredFiles: emptyAutoDiscoveredFiles(),
  });
}

describe("watchRouteTree", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("restarts for a change a listening server sees, once per burst", () => {
    const tree = fakeTree();
    const server = fakeServer();
    watch(server, tree);
    server.httpServer!.emit("listening");
    tree.change();
    server.watcher.emit("add", "/routes/a/page.tsx");
    tree.change();
    server.watcher.emit("add", "/routes/b/page.tsx");
    vi.advanceTimersByTime(50);
    expect(server.restart).toHaveBeenCalledTimes(1);
  });

  it("owes the restart for a change found before it listens", () => {
    const tree = fakeTree();
    const server = fakeServer();
    watch(server, tree);
    tree.change();
    server.watcher.emit("ready");
    vi.advanceTimersByTime(1_000);
    expect(server.restart).not.toHaveBeenCalled();
    server.httpServer!.emit("listening");
    vi.advanceTimersByTime(50);
    expect(server.restart).toHaveBeenCalledTimes(1);
  });

  it("restarts for a change found when the watcher turns ready after listening", () => {
    const tree = fakeTree();
    const server = fakeServer();
    watch(server, tree);
    server.httpServer!.emit("listening");
    tree.change();
    server.watcher.emit("ready");
    vi.advanceTimersByTime(50);
    expect(server.restart).toHaveBeenCalledTimes(1);
  });

  it("a new server owes the restart for a change the old server's scan took in", () => {
    const tree = fakeTree();
    const previous = fakeServer();
    watch(previous, tree);
    previous.httpServer!.emit("listening");
    const next = fakeServer();
    watch(next, tree);
    tree.change();
    previous.watcher.emit("add", "/routes/a/page.tsx");
    next.httpServer!.emit("listening");
    vi.advanceTimersByTime(50);
    expect(next.restart).toHaveBeenCalledTimes(1);
  });

  it("a server configured after the change does not restart again", () => {
    const tree = fakeTree();
    tree.change();
    tree.rescan();
    const server = fakeServer();
    watch(server, tree);
    server.httpServer!.emit("listening");
    server.watcher.emit("ready");
    vi.advanceTimersByTime(1_000);
    expect(server.restart).not.toHaveBeenCalled();
  });

  it("without an http server restarts at once", () => {
    const tree = fakeTree();
    const server = fakeServer(false);
    watch(server, tree);
    tree.change();
    server.watcher.emit("ready");
    vi.advanceTimersByTime(50);
    expect(server.restart).toHaveBeenCalledTimes(1);
  });

  it("a closed server drops its timer", () => {
    const tree = fakeTree();
    const server = fakeServer();
    watch(server, tree);
    server.httpServer!.emit("listening");
    tree.change();
    server.watcher.emit("add", "/routes/a/page.tsx");
    server.httpServer!.emit("close");
    vi.advanceTimersByTime(1_000);
    expect(server.restart).not.toHaveBeenCalled();
  });

  it("logs a restart that fails", async () => {
    const tree = fakeTree();
    const server = fakeServer();
    server.restart.mockRejectedValueOnce(new Error("port taken"));
    watch(server, tree);
    server.httpServer!.emit("listening");
    tree.change();
    server.watcher.emit("add", "/routes/a/page.tsx");
    await vi.advanceTimersByTimeAsync(50);
    expect(server.config.logger.error).toHaveBeenCalledWith(
      expect.stringContaining("restart failed: port taken"),
    );
  });

  it("a tree the scan rejects logs and does not restart", () => {
    const tree = fakeTree();
    const server = fakeServer();
    watch(server, tree);
    server.httpServer!.emit("listening");
    tree.rejectScans(new Error("two pages on one url"));
    server.watcher.emit("add", "/routes/a/page.tsx");
    vi.advanceTimersByTime(1_000);
    expect(server.restart).not.toHaveBeenCalled();
    expect(server.config.logger.error).toHaveBeenCalledWith(
      expect.stringContaining("two pages on one url"),
    );
  });
});
