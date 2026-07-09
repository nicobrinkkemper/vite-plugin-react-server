import { describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// fileWriter is condition-agnostic (no assertNonReactServer), so importing the
// built module directly is safe under either test leg.
import { fileWriter } from "../../dist/plugin/react-static/fileWriter.js";

// Guard: a full-document SSG HTML page must have a root <html> element. If the
// render silently degrades to a fragment (a server-component document wrapper
// that failed to render), the emitted file has content but no <html>/<body> —
// a broken page that would otherwise ship in a green build. fileWriter must
// surface that as a route.error rather than write it silently.

const makeOptions = (onEvent: (e: any) => void) => ({
  route: "/test",
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
  panicThreshold: "none" as const,
  verbose: false,
  onEvent,
  build: {
    outDir: mkdtempSync(join(tmpdir(), "vprs-fw-")),
    static: "static",
    htmlOutputPath: "index.html",
    rscOutputPath: "index.rsc",
  },
});

describe("fileWriter — degraded-HTML guard", () => {
  it("emits a route.error when the HTML has no <html> root (fragment degrade)", async () => {
    const events: any[] = [];
    await fileWriter(
      Readable.from(["<div>page content, no document wrapper</div>"]) as any,
      "html",
      makeOptions((e) => events.push(e)) as any
    );
    const routeErrors = events.filter((e) => e.type === "route.error");
    expect(routeErrors.length).toBeGreaterThan(0);
    expect(String(routeErrors[0].data.error.message)).toMatch(/Degraded HTML/);
  });

  it("does NOT flag a well-formed document", async () => {
    const events: any[] = [];
    await fileWriter(
      Readable.from([
        `<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>`,
      ]) as any,
      "html",
      makeOptions((e) => events.push(e)) as any
    );
    expect(events.filter((e) => e.type === "route.error")).toHaveLength(0);
  });

  it("does NOT flag rsc payloads (only the HTML document is a full document)", async () => {
    const events: any[] = [];
    await fileWriter(
      Readable.from([`0:["$","div",null,{}]`]) as any,
      "rsc",
      makeOptions((e) => events.push(e)) as any
    );
    expect(events.filter((e) => e.type === "route.error")).toHaveLength(0);
  });
});
