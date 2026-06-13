import { describe, it, expect } from "vitest";
import { pathToFileURL } from "node:url";
import { parse } from "acorn";
import { createReactLoader } from "react-server-loader/loader";
import { detectClientModule } from "react-server-loader/directives";

/**
 * Worker/transformer detector parity.
 *
 * Both sides classify "is this a client module?" through the unified
 * detectClientModule helper, but they reach it differently:
 *
 * - WORKER (react-server-loader's Node ESM loader): the real `load` hook —
 *   detectClientModule({ source, moduleId: url }) plus the loader's own
 *   format gating and use-server scanner.
 * - BUILD transformer: detectClientModule({ source, parseFn: this.parse })
 *   at transform time (source only — the filename pattern is deliberately
 *   deferred to createModuleID, which re-runs the helper WITH the moduleId).
 *
 * If the two ever disagree for a module, the registered client reference
 * and the worker's runtime classification split — the bug class behind the
 * directive-only node_modules regressions. Every case below runs through
 * BOTH paths and asserts the same answer.
 */

/** WORKER path: the actual loader hook, observed via onTransform. */
async function workerClassifies(
  source: string,
  filePath: string
): Promise<boolean> {
  let sawClient = false;
  const { load } = createReactLoader({
    moduleID: (p: string) => p,
    onTransform: ({ isClient }: { isClient: boolean }) => {
      sawClient = sawClient || isClient;
    },
  } as any);

  await load(
    pathToFileURL(filePath).href,
    { format: "module" } as any,
    async () => ({ source, format: "module", shortCircuit: true } as any)
  );
  return sawClient;
}

/**
 * BUILD path: the transformer's directive detection (source + JSX-aware
 * parse, mirroring createTransformerPlugin) OR'd with the filename check
 * createModuleID applies downstream via the same helper.
 */
function buildClassifies(source: string, filePath: string): boolean {
  const byDirective = detectClientModule({
    source,
    parseFn: (src: string, opts: any) =>
      parse(src, { ...opts, sourceType: "module", ecmaVersion: "latest" }) as any,
  });
  const byFilename = detectClientModule({ moduleId: filePath });
  return byDirective || byFilename;
}

interface ParityCase {
  name: string;
  filePath: string;
  source: string;
  expected: boolean;
}

const DIRECTIVE_SOURCE = `"use client";\nexport function Widget() { return null; }\n`;

const CASES: ParityCase[] = [
  {
    name: "use-strict prologue followed by use-client (prologue-tolerant)",
    filePath: "/proj/src/widget.tsx",
    source: `"use strict";\n"use client";\nexport function Widget() { return null; }\n`,
    expected: true,
  },
  {
    name: "JSDoc block before use-client (comment-tolerant)",
    filePath: "/proj/src/widget.tsx",
    source: `/**\n * A widget.\n */\n"use client";\nexport function Widget() { return null; }\n`,
    expected: true,
  },
  {
    name: "comment containing the word 'client' is NOT a directive",
    filePath: "/proj/src/widget.tsx",
    source: `// this renders on the client eventually\nexport function Widget() { return null; }\n`,
    expected: false,
  },
  {
    name: "identifiers named clientId/clientFoo do NOT misclassify",
    filePath: "/proj/src/ids.ts",
    source: `export const clientId = "abc";\nexport function clientFoo() { return clientId; }\n`,
    expected: false,
  },
  {
    name: "directive in a string literal mid-module is NOT a directive",
    filePath: "/proj/src/strings.ts",
    source: `export const hint = 'use client';\n`,
    expected: false,
  },
  // Extension sweep: directive-only modules, no `.client.` in the filename.
  ...[".mjs", ".ts", ".tsx", ".jsx", ".js", ".cjs"].map((ext) => ({
    name: `directive-only module with ${ext} extension`,
    filePath: `/proj/src/widget${ext}`,
    source: DIRECTIVE_SOURCE,
    expected: true,
  })),
  {
    name: "`.client.` filename without a directive (filename convention)",
    filePath: "/proj/src/components/Link.client.tsx",
    source: `export function Link() { return null; }\n`,
    expected: true,
  },
  {
    name: "directive-only first-party path",
    filePath: "/proj/src/view/View.generated.tsx",
    source: DIRECTIVE_SOURCE,
    expected: true,
  },
  {
    name: "directive-only node_modules path",
    filePath: "/proj/node_modules/some-lib/dist/index.js",
    source: DIRECTIVE_SOURCE,
    expected: true,
  },
  {
    // The predicted next bug from the detector-collapse work: a node_modules
    // package shipping use-strict + JSDoc + use-client with an .mjs
    // extension, reaching the worker react-loader path.
    name: "node_modules .mjs with use-strict + JSDoc + use-client",
    filePath: "/proj/node_modules/ui-kit/dist/button.mjs",
    source: `"use strict";\n/**\n * compiled by tsup\n */\n"use client";\nexport function Button() { return null; }\n`,
    expected: true,
  },
  {
    name: "plain server module stays server",
    filePath: "/proj/src/page/page.tsx",
    source: `export function Page() { return null; }\n`,
    expected: false,
  },
];

describe("worker react-loader vs build transformer — client classification parity", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const worker = await workerClassifies(c.source, c.filePath);
      const build = buildClassifies(c.source, c.filePath);

      // parity first: the two paths must agree...
      expect(worker, `worker=${worker} build=${build}`).toBe(build);
      // ...and on the right answer
      expect(worker).toBe(c.expected);
    });
  }
});
