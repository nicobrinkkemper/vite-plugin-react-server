# Transformer

> Contributor documentation. Covers how the transformer plugin processes `"use client"` and `"use server"` directives.

## Overview

The transformer runs in Vite's `"post"` enforcement phase via `transformModuleIfNeeded`:

```ts
export function reactTransformPlugin(options: StreamPluginOptions): Plugin {
  return {
    name: "vite-plugin-react-server:transformer",
    enforce: "post",
    transform(code, id) {
      return transformModuleIfNeeded(code, id, options);
    },
  };
}
```

## Transformation Steps

1. **Module identification** — should this file be transformed?
2. **AST parsing** — parse with JSX/TypeScript support
3. **Directive detection** — find `"use client"` / `"use server"` directives
4. **Code transformation** — apply environment-specific transforms
5. **Code generation** — output with `retainLines: true`

## Directive Rules

```ts
const DIRECTIVE_CONFIGS = {
  client: {
    functionLevel: false,         // "use client" only at file level
    validate: (params) => params.index === 0,
    warning: "'use client' directive is only allowed at the top of a file",
  },
  server: {
    functionLevel: true,          // "use server" at file or function level
    validate: (params) => {
      const before = params.code.slice(0, params.index).trim();
      return before === "" || before.endsWith("\n");
    },
    warning: "File-level directives must be at the top of the file",
  },
};
```

## What Gets Transformed

### `"use server"` files → server build

Exports get `registerServerReference`:

```ts
// Before
"use server";
export async function add(a, b) { return a + b; }

// After (dist/server/)
import { registerServerReference } from "react-server-dom-esm/server";
function add(a, b) { return a + b; }
registerServerReference(add, "/src/actions.server.ts", "add");
export { add };
```

### `"use client"` files → server build

Implementation stripped, replaced with `registerClientReference`:

```ts
// Before
"use client";
export function Counter() { /* ... */ }

// After (dist/server/)
import { registerClientReference } from "react-server-dom-esm/server";
const Counter = registerClientReference(
  function() { throw new Error("Cannot call Counter() from the server..."); },
  "/components/Counter.client-CnBCzH8H.js",
  "Counter"
);
export { Counter };
```

### `"use client"` files → client/static builds

Directive is removed. Code is otherwise unchanged (minified in static build).

### `"use server"` files → client/static builds

Server actions are excluded entirely.

## Client-Module Classification

The transformer never re-implements directive detection. It calls `detectClientModule({ source, moduleId, parseFn: this.parse })` from `plugin/loader/directives/detectClientModule.ts` — the single source of truth shared with the dev-server file watcher, the worker react-loader, build auto-discover, and the configurable `loader.*` defaults. The `parseFn` argument lets the transformer use Rollup's AST; the other call sites fall through to the parser-free `sourceHasTopLevelClientDirective` scanner. Both paths agree on every well-authored case.

The filename half of the classifier:

```ts
// plugin/loader/directives/detectClientModule.ts:23
const CLIENT_FILENAME_PATTERN = /(^|[\/.])client\.[cm]?[jt]sx?$/;
```

Widened in 1.11.1 to cover the standalone basename `client.tsx` in addition to the dotted-suffix convention (`Foo.client.tsx`). The leading-`(^|[\/.])` anchor keeps it strict — `clientUtils.ts` is not matched.

## Auto-Discovery Patterns

The build pulls client modules from two discoverers chained into one input record (see `docs/internals/architecture.md` for the full pipeline):

- `createGlobAutoDiscover("**/*.client.*")` — filename convention.
- `createDirectiveClientAutoDiscover()` (added 1.10.0, `plugin/config/autoDiscover/createDirectiveClientAutoDiscover.ts`) — directive-only modules. Walks `moduleBase`, skips `node_modules`, skips files already covered by the filename convention, then admits files where `sourceHasTopLevelClientDirective(source)` returns `true`. Also skips any file referenced by `<projectRoot>/index.html` `<script type="module" src>` to avoid clobbering Vite's own `index.html` manifest entry (1.11.2).

Other pattern matchers used elsewhere in the build:

```ts
const patterns = {
  serverPattern: /\.server\.(js|ts|jsx|tsx)$/,
  pagePattern: /[Pp]age\.(js|ts|jsx|tsx)$/,
  propsPattern: /[Pp]rops\.(js|ts|jsx|tsx)$/,
  cssPattern: /\.css$/,
};
```

## Custom Detection

Override directive detection in config:

```ts
{
  isServerFunctionCode: (code, moduleId) => boolean,
  isClientComponentCode: (code, moduleId) => boolean,
  getDirectiveType: (directive, moduleId) => "client" | "server" | undefined,
}
```
