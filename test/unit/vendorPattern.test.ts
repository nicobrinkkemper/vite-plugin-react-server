import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../../plugin/config/defaults.js";
import { createTransformerPlugin } from "../../plugin/transformer/createTransformerPlugin.js";
import { isVendorModule } from "../../plugin/transformer/isVendorModule.js";
import { hasLeadingDirective } from "../../plugin/transformer/hasLeadingDirective.js";
import { userProjectRoot } from "../../plugin/root.js";

const vendorPattern = DEFAULT_CONFIG.AUTO_DISCOVER.vendorPattern;

describe("isVendorModule with the default vendorPattern", () => {
  const vendor = (id: string, root = "/home/me/app") =>
    isVendorModule(vendorPattern, id, root);

  it("matches the absolute ids the bundler passes", () => {
    expect(vendor("/home/me/app/node_modules/react/index.js")).toBe(true);
    expect(vendor("/home/me/app/node_modules/@chakra-ui/react/dist/index.mjs")).toBe(true);
  });

  it("matches query-suffixed and pre-bundled ids", () => {
    expect(vendor("/home/me/app/node_modules/.vite/deps/react.js?v=1a2b3c")).toBe(true);
    expect(vendor("/home/me/app/node_modules/lib/index.js?import")).toBe(true);
  });

  it("matches pnpm's nested store layout", () => {
    expect(
      vendor("/home/me/app/node_modules/.pnpm/react@19.2.0/node_modules/react/index.js")
    ).toBe(true);
  });

  it("matches Windows ids", () => {
    expect(vendor("C:\\app\\node_modules\\react\\index.js", "C:\\app")).toBe(true);
    expect(vendor("C:/app/node_modules/react/index.js", "C:/app")).toBe(true);
  });

  it("matches installs nested below or hoisted above the root", () => {
    expect(vendor("/home/me/app/packages/ui/node_modules/lib/index.js")).toBe(true);
    expect(vendor("/home/me/node_modules/lib/index.js", "/home/me/repo/apps/web")).toBe(true);
  });

  it("leaves first-party files alone", () => {
    expect(vendor("/home/me/app/src/page.tsx")).toBe(false);
    expect(vendor("/home/me/app/src/node_modules_list.tsx")).toBe(false);
    expect(vendor("/home/me/app/src/page.tsx?v=123")).toBe(false);
    expect(vendor("C:\\app\\src\\page.tsx", "C:\\app")).toBe(false);
    // A project that itself sits under a node_modules directory.
    expect(
      vendor("/tmp/node_modules/my-app/src/page.tsx", "/tmp/node_modules/my-app")
    ).toBe(false);
  });
});

describe("isVendorModule with a user vendorPattern", () => {
  it("keeps a pattern written for absolute ids working", () => {
    const pattern = /node_modules|_virtual/;
    expect(isVendorModule(pattern, "/home/me/app/node_modules/x/i.js", "/home/me/app")).toBe(true);
    expect(isVendorModule(pattern, "/home/me/app/_virtual/x.js", "/home/me/app")).toBe(true);
    expect(isVendorModule(pattern, "/home/me/app/src/x.js", "/home/me/app")).toBe(false);
  });

  it("applies a root-relative pattern to the root-relative path", () => {
    const pattern = /^\/vendor\//;
    expect(isVendorModule(pattern, "/home/me/app/vendor/lib.js", "/home/me/app")).toBe(true);
    expect(isVendorModule(pattern, "/home/me/app/src/vendor/lib.js", "/home/me/app")).toBe(false);
  });

  it("is stable across calls with a global pattern", () => {
    const pattern = /node_modules/g;
    const id = "/home/me/app/node_modules/x/i.js";
    expect(isVendorModule(pattern, id, "/home/me/app")).toBe(true);
    expect(isVendorModule(pattern, id, "/home/me/app")).toBe(true);
  });
});

describe("hasLeadingDirective", () => {
  it("finds a prologue directive behind a BOM, comments and 'use strict'", () => {
    expect(hasLeadingDirective(`"use client";\nexport const a = 1;`)).toBe(true);
    expect(hasLeadingDirective(`'use server'\nexport async function act() {}`)).toBe(true);
    expect(
      hasLeadingDirective(`﻿/*! lib */\n// comment\n"use strict";\n"use client";\n`)
    ).toBe(true);
  });

  it("ignores the words outside the prologue", () => {
    expect(hasLeadingDirective(`import a from "a";\n"use client";`)).toBe(false);
    expect(hasLeadingDirective(`// "use client"\nexport const a = 1;`)).toBe(false);
    expect(hasLeadingDirective(`export const s = "use server";`)).toBe(false);
    expect(hasLeadingDirective(`"use strict";\nexport const a = 1;`)).toBe(false);
    expect(hasLeadingDirective(``)).toBe(false);
  });
});

describe("transform-dynamic on a node_modules module", () => {
  const useClient = `"use client";\nimport { useState } from "react";\nexport function Widget() { useState(0); return null; }\n`;
  const id = `${userProjectRoot}/node_modules/some-dep/index.js`;
  const server = { environment: { name: "server", logger: console } };

  const transform = (clientPackages: string[]) => {
    const plugin = createTransformerPlugin({
      name: "dynamic",
      allowedEnvironments: ["client", "ssr", "server"],
    })({ clientPackages } as any) as any;
    return (code: string, moduleId: string) =>
      plugin.transform.handler.call(server, code, moduleId, { moduleType: "js" });
  };

  it("skips a dependency module without a directive", async () => {
    const plain = `import { useState } from "react";\nexport function Widget() { useState(0); return null; }\n`;
    expect(await transform([])(plain, id)).toBeNull();
    expect(await transform([])(plain, `${id}?v=abc`)).toBeNull();
    // The word in a comment or a string is not a directive.
    const mention = `// not "use client"\nexport const label = "use server";\n`;
    expect(await transform([])(mention, id)).toBeNull();
  });

  it("still transforms a dependency module with a directive, client package or not", async () => {
    const result = await transform([])(useClient, id);
    expect(result?.code).toContain("registerClientReference");
    expect(result?.code).toContain("Widget");
    // A published prologue: license comment, then the directive.
    const prologue = `/*! lib v1 */\n${useClient}`;
    expect((await transform([])(prologue, id))?.code).toContain(
      "registerClientReference"
    );
  });

  it("still turns a client package's 'use client' module into a client reference", async () => {
    const result = await transform(["some-dep"])(useClient, id);
    expect(result?.code).toContain("registerClientReference");
    expect(result?.code).toContain("Widget");
  });

  it("still transforms first-party modules", async () => {
    const result = await transform([])(useClient, `${userProjectRoot}/src/Widget.tsx`);
    expect(result?.code).toContain("registerClientReference");
  });
});
