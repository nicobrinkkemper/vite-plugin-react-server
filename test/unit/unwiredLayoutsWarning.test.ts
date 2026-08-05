import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveOptions } from "../../plugin/config/resolveOptions.js";

/**
 * A routes tree containing `route.tsx` layouts, configured through the manual
 * path (Page/props without a `layouts` resolver), renders every page unwrapped
 * with no other signal. resolveOptions warns once when it finds a layout file
 * on disk and no resolver wired.
 *
 * The warning is once-per-process and vitest isolates test files, so this file
 * owns the whole budget — the quiet cases run FIRST (they'd be vacuous after
 * the positive case consumes the guard).
 */

let root: string;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "vprs-layouts-warn-"));
  mkdirSync(join(root, "src", "pages", "about"), { recursive: true });
  writeFileSync(join(root, "src", "pages", "page.tsx"), "export const Page = () => null;\n");
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  rmSync(root, { recursive: true, force: true });
});

const layoutWarnings = () =>
  warnSpy.mock.calls.filter(([msg]) =>
    String(msg).includes("no `layouts` resolver is configured")
  );

const resolveWith = (extra: Record<string, unknown> = {}) =>
  resolveOptions({
    moduleBase: "src",
    projectRoot: root,
    Page: () => "src/pages/page.tsx",
    forceResolve: true,
    ...extra,
  } as never);

describe("config/resolveOptions — unwired route.tsx layouts warning", () => {
  it("stays quiet when no route.tsx exists", () => {
    expect(resolveWith().type).toBe("success");
    expect(layoutWarnings().length).toBe(0);
  });

  it("stays quiet when a layouts resolver is configured", () => {
    writeFileSync(join(root, "src", "pages", "route.tsx"), "export default null;\n");
    expect(resolveWith({ layouts: () => [] }).type).toBe("success");
    expect(layoutWarnings().length).toBe(0);
  });

  it("warns once when route.tsx files exist but no layouts resolver is passed", () => {
    writeFileSync(join(root, "src", "pages", "about", "route.tsx"), "export default null;\n");
    expect(resolveWith().type).toBe("success");
    const warnings = layoutWarnings();
    expect(warnings.length).toBe(1);
    expect(String(warnings[0]?.[0])).toContain("route.tsx");

    // Once per process: a second resolve stays quiet.
    expect(resolveWith().type).toBe("success");
    expect(layoutWarnings().length).toBe(1);
  });
});
