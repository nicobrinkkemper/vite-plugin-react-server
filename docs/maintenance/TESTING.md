## Testing

This project uses Vitest and React conditions to test both server and client implementations. Tests are organized by intent (server, client, examples) and selectively included based on the current Node.js condition.

### Key Ideas
- Server-only tests run under the `react-server` condition
- Client tests run under the default condition (`null`)
- Example tests validate end-to-end plugin usage patterns and can be executed under both conditions when needed

### Vitest Configuration
Tests are dynamically included/excluded based on condition:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { getCondition } from "vite-plugin-react-server/config";

export default defineConfig({
  mode: "development",
  test: {
    globals: true,
    hookTimeout: 10000,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.*"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      // these folders require the server condition
      ...(getCondition() !== "react-server" ? ["test/unit/**/*.test.*", "test/server/**/*.test.*"] : []),
    ],
  },
});
```

### Test Commands
Use the provided scripts to target specific suites:

```bash
# All tests (respects current condition)
npm run test

# Server tests (forces react-server condition)
npm run test:server

# Client tests
npm run test:client

# Example tests (run under both server and client where applicable)
npm run test:examples

# Typecheck
npm run test:typecheck
```

### Test Layout

- `test/server/**`: tests that must run in `react-server`
- `test/client/**`: tests that can run in default condition and validate client/static flows
- `test/examples/**`: high-level, end-to-end examples demonstrating plugin usage
- `test/fixtures/**`: build fixtures and generated assets

### Common Test Patterns

#### Client Static Generation (Headless + Full HTML)
Use the client static plugin to render RSC and HTML streams on the main thread and collect metrics/events.

```ts
// test/client/static-client-plugin.test.ts
import { describe, it, expect } from "vitest";
import { doBuildStaticClient } from "./doBuildStaticClient.js";

it("should collect metrics and file.write events", async () => {
  const events = await doBuildStaticClient({
    projectRoot: '/abs/test/dir',
    verbose: true,
    onMetrics: (m) => {/* collect */},
    onEvent: (e) => {/* observe */}
  });

  const htmlDone = events.find(e => e.type === 'file.write.done' && e.data.fileType === 'html');
  const rscDone = events.find(e => e.type === 'file.write.done' && e.data.fileType === 'rsc');

  expect(htmlDone?.data.content.length).toBeGreaterThan(0);
  expect(rscDone?.data.content.length).toBeGreaterThan(0);
});
```

#### Server Build Orchestration
Assert server plugin behavior, build lifecycle hooks, and SSR bundles that require `react-server`.

```ts
// test/server/build.test.ts (excerpt)
import { describe, it, expect } from 'vitest';
import { doBuild } from './doBuild.js';

describe('Plugin build test', () => {
  it("should abort on configured events", async () => {
    await expect(doBuild({
      projectRoot: '/abs/test/dir',
      panicThreshold: 'all_errors',
      onEvent: (event) => {
        if (event.type === 'build.start') throw new Error('Build cancelled (build.start)');
      },
    })).rejects.toThrow('[vite:plugin-react-server/static] Build cancelled (build.start)');
  });
});
```

#### Examples: End-to-End Plugin Usage
Demonstrate realistic plugin usage with custom transforms and assertions on real HTML/RSC output.

```ts
// test/examples/custom-transform-index-html.test.tsx (excerpt)
import { describe, it, expect } from 'vitest';

it('should render real content via custom plugin', async () => {
  // Builds, runs static generation, asserts HTML includes real content
  // and that metrics/events are consistent across phases
  expect(true).toBe(true);
});
```

### When to Put Tests in Server vs Client vs Examples

- Put tests in `test/server` when they:
  - Require SSR pipeline under `react-server`
  - Depend on server-only helpers or loaders
  - Validate server-side lifecycle (e.g., build hooks, server actions plumbing)

- Put tests in `test/client` when they:
  - Exercise static generation paths (headless/full HTML) without SSR-only semantics
  - Validate client/static plugin behavior, metrics, and event emission
  - Assert client bundle manifests and asset wiring

- Put tests in `test/examples` when they:
  - Demonstrate realistic plugin usage end-to-end
  - Showcase integration with custom Vite plugins or transforms
  - Are good reference material for users

### Proposed Test Moves (Server → Client/Examples)
React conditions allow some server-only tests to move to client/examples to shorten the feedback loop and reduce reliance on `react-server` during CI.

Candidates to consider:

- Move to `test/examples/` (scenario-driven, end-to-end):
  - `test/server/custom-root-function.test.ts`
  - `test/server/custom-root-string.test.ts`
  - Rationale: these validate HTML wrapper customization and can run as user-facing examples

- Move to `test/client/` (plugin/static behavior):
  - Portions of `test/server/error-boundaries.test.ts` that assert client-visible behavior (keep build-specific variant server-side)
  - Non-SSR-specific parts of `test/server/props-variations.test.ts` that can be asserted via static client generation
  - Rationale: assertions don’t require `react-server` loaders and can be validated via static client plugin

- Keep in `test/server/`:
  - `build.test.ts`, `react-loader-direct-call.test.ts`, `rsc-server.test.ts`, `large-html.test.ts`, `inline-css.test.ts`, `dev-server-env.test.ts`, `unified-component-resolution.test.ts`
  - Rationale: depend on server condition, SSR loaders, or stress server-only paths

### Ready-to-run move commands (optional)
If you decide to proceed, here are non-destructive git moves (preserve history):

```bash
# Examples
git mv test/server/custom-root-function.test.ts test/examples/custom-root-function.test.ts
git mv test/server/custom-root-string.test.ts   test/examples/custom-root-string.test.ts

# Client (extract server-independent assertions if needed)
# Consider duplicating then pruning server-only assertions
cp test/server/error-boundaries.test.ts test/client/error-boundaries-static.test.ts
cp test/server/props-variations.test.ts test/client/props-variations-static.test.ts
```

Notes:
- For duplicated tests, prune server-only assertions and switch helper imports to the client/static builders (e.g., `doBuildStaticClient`)
- Keep build-specific tests (e.g., `error-boundaries-build.test.ts`) under `test/server`

### Writing New Tests
- Prefer client/examples when possible to keep iterations fast
- Use `onEvent` and `onMetrics` hooks to assert observability rather than inspecting internals
- Use fixtures and the `doBuild`/`doBuildStaticClient` helpers to standardize builds

### CI Guidance
- Run client and examples on every push (fast path)
- Schedule or gate server suite (`test:server`) where `react-server` is required

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->



1.	[Getting Started](./getting-started.md)
2.	[Core Concepts](./core-concepts.md)
3.	[Configuration Guide](./configuration.md)
4.	[CSS & Styling](./css-handling.md)
5.	[Server Actions](./server-actions.md)
6.	[Build & Deployment](./build-orchestration.md)
7.	[Advanced Development](./advanced-topics.md)
8.	[Plugin Internals](./transformer-plugin.md)
9.	[Worker System](./rsc-worker.md)
10.	[API Reference](./api-reference.md)
11.	[React Compatibility](./react-type-compatibility.md)
12.	[Troubleshooting](./troubleshooting-guide.md)
13.	**[Testing](./testing.md) ← you are here**

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->
