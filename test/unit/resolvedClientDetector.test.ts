import { describe, it, expect } from "vitest";
import { testUserOptions } from "../test-config.js";
import { resolveOptions } from "vite-plugin-react-server/config";
import { DEFAULT_LOADER_CONFIG } from "vite-plugin-react-server/config";

/**
 * Pins the resolution routing for the `loader.isClientComponent*` hooks in
 * `resolveOptions`: an explicit user hook wins; otherwise a user-supplied
 * `loader.clientDirective` / `autoDiscover.clientPattern` drives matching;
 * otherwise the single detector (`detectClientModule` behind
 * DEFAULT_LOADER_CONFIG) decides.
 *
 * Regression target: the resolver used to pass the PRE-RESOLVED
 * clientDirective (never undefined) into resolveDirectiveMatcher, so the
 * anchored default regex always shadowed the detector — `.client.tsx`
 * modules without a directive resolved to false in-process while the worker
 * loader (re-resolving defaults after serialization strips function hooks)
 * said true, and user-supplied hooks were silently ignored.
 */

// The loader config is only resolved when `loader.mode` is set.
const resolve = (
  extra: { loader?: Record<string, unknown>; autoDiscover?: Record<string, unknown> } = {}
) =>
  resolveOptions({
    ...testUserOptions,
    ...extra,
    loader: { mode: "test", ...(extra.loader ?? {}) },
  } as Parameters<typeof resolveOptions>[0]).userOptions!;

describe("resolveOptions isClientComponent* routing", () => {
  it("defaults are the DEFAULT_LOADER_CONFIG detectors themselves (worker parity)", () => {
    const { loader } = resolve();
    expect(loader!.isClientComponentCode).toBe(
      DEFAULT_LOADER_CONFIG.isClientComponentCode
    );
    expect(loader!.isClientComponentByCode).toBe(
      DEFAULT_LOADER_CONFIG.isClientComponentByCode
    );
    expect(loader!.isClientComponentByName).toBe(
      DEFAULT_LOADER_CONFIG.isClientComponentByName
    );
  });

  it("default isClientComponentCode classifies by directive, never by filename", () => {
    const { loader } = resolve();
    // The source decides, and only the source. A `.client.tsx` name with no
    // directive is a server module — here and under every other React toolchain
    // (react-server-loader 19.2.15 stopped reading the name; a first-party file
    // shaped like this gets a build warning telling the author to add it).
    expect(
      loader!.isClientComponentCode(
        `export const x = 1;`,
        "src/components/Counter.client.tsx"
      )
    ).toBe(false);
    // A real directive is recognised regardless of the filename.
    expect(
      loader!.isClientComponentCode(
        `"use client";\nexport const x = 1;`,
        "src/components/Counter.tsx"
      )
    ).toBe(true);
    // Substring trap stays rejected.
    expect(
      loader!.isClientComponentCode(`export const x = 1;`, "src/lib/clientId.ts")
    ).toBe(false);
  });

  it("default isClientComponentCode accepts a directive after 'use strict'", () => {
    const { loader } = resolve();
    expect(
      loader!.isClientComponentCode(
        `"use strict";\n"use client";\nexport const x = 1;`,
        "node_modules/some-lib/dist/leaf.js"
      )
    ).toBe(true);
  });

  it("an explicit user hook wins over the default", () => {
    const isClientComponentCode = (_code: string, _moduleId?: string) => true;
    const isClientComponentByName = (_moduleId: string) => true;
    const { loader } = resolve({
      loader: { isClientComponentCode, isClientComponentByName },
    });
    expect(loader!.isClientComponentCode).toBe(isClientComponentCode);
    expect(loader!.isClientComponentByName).toBe(isClientComponentByName);
  });

  it("a user clientDirective drives source matching when no hook is given", () => {
    const { loader } = resolve({
      loader: { clientDirective: /^\/\/ my-client-marker/ },
    });
    expect(
      loader!.isClientComponentCode(`// my-client-marker\nexport const x = 1;`)
    ).toBe(true);
    expect(
      loader!.isClientComponentCode(`"use client";\nexport const x = 1;`)
    ).toBe(false);
  });

  it("a user autoDiscover.clientPattern drives byName matching when no hook is given", () => {
    const { loader } = resolve({
      autoDiscover: { clientPattern: /\.browser\.tsx$/ },
    });
    expect(loader!.isClientComponentByName("src/App.browser.tsx")).toBe(true);
    expect(loader!.isClientComponentByName("src/App.client.tsx")).toBe(false);
  });
});
