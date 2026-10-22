import { describe, it, expect } from "vitest";
import type { Plugin } from "vite";
import { createPluginOrchestrator } from "../../plugin/orchestrator/createPluginOrchestrator.server.js";
import { viteFinal } from "../../plugin/storybook/preset.js";

// A hook filter lets the bundler skip a hook without calling into JS. It must
// never skip an id the handler would act on, or behaviour depends on whether
// the bundler honours filters. For every filtered hook: whenever the filter
// rejects an input, the handler (run as a bundler without filter support
// would) must return nothing.

type Pattern = RegExp | RegExp[];
type IdFilter = Pattern | { include?: Pattern; exclude?: Pattern };

const arr = (p?: Pattern) => (p === undefined ? undefined : Array.isArray(p) ? p : [p]);
const test = (re: RegExp, s: string) => {
  const r = re.test(s);
  re.lastIndex = 0;
  return r;
};
// Same include/exclude semantics as Vite's and Rolldown's filters.
const matches = (filter: IdFilter | undefined, value: string) => {
  if (!filter) return true;
  const { include, exclude } =
    filter instanceof RegExp || Array.isArray(filter)
      ? { include: filter, exclude: undefined }
      : filter;
  if (arr(exclude)?.some((re) => test(re, value))) return false;
  const inc = arr(include);
  if (inc?.some((re) => test(re, value))) return true;
  return !(inc && inc.length > 0);
};

const ids = [
  "react",
  "react/jsx-runtime",
  "react-server-dom-esm",
  "react-server-dom-esm/client",
  "react-server-dom-esm/client.browser",
  "react-server-dom-esm/server",
  "react-server-dom-esm/static.node",
  "virtual:react-server/hmr",
  "\0virtual:react-server/hmr",
  "\0virtual:react-server/hmr?storybook-stub",
  "\0vprs-server-ref:/app/src/actions.server.ts",
  "\0commonjsHelpers.js",
  "./actions.server.ts",
  "./actions.server.tsx?import",
  "/app/src/actions.server.js",
  "/app/src/actions.server.ts.css",
  "/app/src/page.tsx",
  "/app/src/page.tsx?v=123",
  "/app/src/Button.client.jsx",
  "/app/src/util.mjs",
  "/app/src/util.cts",
  "/app/src/style.css",
  "/app/src/data.json",
  "/app/src/logo.svg?url",
  "/app/node_modules/react/index.js",
  "/app/node_modules/@chakra-ui/react/dist/index.mjs",
  "C:\\app\\src\\page.tsx",
];

const codes = [
  "export const x = 1;",
  `"use client";\nimport { useState } from "react";\nexport const C = () => null;`,
  `"use server";\nexport async function act() {}`,
  `import React from "react";`,
];

const hookNames = ["resolveId", "load", "transform"] as const;

const filteredHooks = (plugins: Plugin[]) =>
  plugins.flatMap((plugin) =>
    hookNames.flatMap((hook) => {
      const h = (plugin as any)[hook];
      return h && typeof h === "object" && h.filter
        ? [{ name: `${plugin.name} ${hook}`, hook, filter: h.filter, handler: h.handler }]
        : [];
    })
  );

const contexts = ["client", "ssr", "server"].map((name) => ({
  environment: { name },
  resolve: async () => {
    throw new Error("resolve must not run for a rejected id");
  },
}));

const plugins = [
  ...createPluginOrchestrator({}),
  ...((await viteFinal({ plugins: [] }, { rsc: false })).plugins as Plugin[]),
];
const hooks = filteredHooks(plugins);

describe("hook filters", () => {
  it("covers the hooks that carry one", () => {
    const names = hooks.map((h) => h.name);
    for (const expected of [
      "vite-plugin-react-server:vendor-alias resolveId",
      "vite-plugin-react-server:transform-dynamic transform",
      "vite-plugin-react-server:virtual-rsc-hmr resolveId",
      "vite-plugin-react-server:virtual-rsc-hmr load",
      "vite-plugin-react-server:server-reference-client resolveId",
      "vite-plugin-react-server:server-reference-client load",
      "vite-plugin-react-server:server-cjs-fix transform",
      "vite-plugin-react-server:storybook:resolve-rsd resolveId",
      "vite-plugin-react-server:storybook:stub-virtual-rsc-hmr resolveId",
      "vite-plugin-react-server:storybook:stub-virtual-rsc-hmr load",
    ]) {
      expect(names).toContain(expected);
    }
  });

  for (const { name, hook, filter, handler } of hooks) {
    it(`${name}: a rejected input is one the handler ignores`, async () => {
      for (const id of ids) {
        for (const code of hook === "transform" ? codes : [""]) {
          const accepted =
            matches(filter.id, id.replace(/\\/g, "/")) &&
            (hook !== "transform" || matches(filter.code, code));
          if (accepted) continue;
          for (const ctx of contexts) {
            const result =
              hook === "transform"
                ? await handler.call(ctx, code, id, { moduleType: "js" })
                : await handler.call(ctx, id, "/app/src/page.tsx", {});
            expect(result ?? null, `${JSON.stringify(id)} / ${JSON.stringify(code)}`).toBeNull();
          }
        }
      }
    });
  }

  it("accepts the inputs each handler acts on", () => {
    const byName = Object.fromEntries(hooks.map((h) => [h.name, h.filter]));
    const accepts = (name: string, id: string, code = "") =>
      matches(byName[name].id, id) && matches(byName[name].code, code);
    expect(accepts("vite-plugin-react-server:vendor-alias resolveId", "react-server-dom-esm/server")).toBe(true);
    expect(accepts("vite-plugin-react-server:transform-dynamic transform", "/app/src/page.tsx")).toBe(true);
    expect(accepts("vite-plugin-react-server:virtual-rsc-hmr resolveId", "virtual:react-server/hmr")).toBe(true);
    expect(accepts("vite-plugin-react-server:virtual-rsc-hmr load", "\0virtual:react-server/hmr")).toBe(true);
    expect(accepts("vite-plugin-react-server:server-reference-client resolveId", "./actions.server.tsx?import")).toBe(true);
    expect(accepts("vite-plugin-react-server:server-reference-client resolveId", "\0vprs-server-ref:/a.server.ts")).toBe(true);
    expect(accepts("vite-plugin-react-server:server-reference-client load", "\0vprs-server-ref:/a.server.ts")).toBe(true);
    expect(accepts("vite-plugin-react-server:server-cjs-fix transform", "/app/src/page.tsx", `import { useState } from "react";`)).toBe(true);
  });
});
