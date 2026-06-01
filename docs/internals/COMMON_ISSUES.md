# Common Issues & Solutions

## Build Issues

### Environment API Build Failures

**Symptoms**: `TypeError: builder.buildApp is not a function`

**Fix**: Use `createBuilder()` from Vite, not the `build()` function:

```typescript
import { createBuilder } from "vite";

const builder = await createBuilder({
  plugins: [vitePluginReactServer(options)],
  root: projectRoot,
});
await builder.buildApp();
```

### React Module Externalization

**Symptoms**: `"__require" is not exported by react/index.js`

**Fix**: `externalConditions` must be at the environment `resolve` level, NOT inside `build.rollupOptions`:

```typescript
// ✅ Correct
environments[envName] = {
  resolve: {
    externalConditions: ['react-server'],
  },
  build: {
    rollupOptions: {
      external: ["react", "react-dom"],
    },
  },
};
```

### Performance Script in HTML Output

**Symptoms**: `<script>requestAnimationFrame(function(){$RT=performance.now()});</script>` appears inconsistently.

**Cause**: Calling `pipe()` inside `onShellReady` callback instead of immediately after `renderToPipeableStream` returns.

```typescript
// ✅ Correct — pipe immediately
const { pipe } = renderToPipeableStream(element, { onShellReady() {} });
pipe(passThrough);

// ❌ Wrong — pipe inside callback triggers React suspense timing
const { pipe } = renderToPipeableStream(element, {
  onShellReady() { pipe(passThrough); }
});
```

## Dev Mode Issues

### White Screen / Module Not Found

**Symptoms**: `react-server-dom-esm` not found, blank page in dev.

**Cause**: Vite 6's module runner uses Node resolution, not plugin `resolveId` hooks. The vendored package needs a `node_modules` symlink.

**Fix**: The plugin auto-creates this symlink in `configResolved`. If it's missing:
1. Delete `node_modules/.vite`
2. Restart the dev server

### HMR Not Working

**Symptoms**: Full page reload instead of hot update on component changes.

**Checklist**:
- `@vitejs/plugin-react` must be listed *before* `vitePluginReactServer()` in config
- Client components (`.client.tsx`) need `"use client"` directive for reliable detection
- Check browser console for `[RSC HMR]` messages

## Test Issues

### React Condition Conflicts

Tests must run with the correct Node.js condition:

```bash
# Server/RSC tests
NODE_OPTIONS='--conditions react-server' npx vitest ./test/examples/build

# Client tests (no special condition needed)
npx vitest ./test/examples/client
```

### Test Timeouts

Default Vitest timeout (5s) may be too short for build tests:

```bash
npx vitest ./test/examples/build --timeout 60000
```

## AutoDiscover / Manifest Issues

### Missing Global CSS in Built HTML (pre-1.11.2 regression)

**Symptoms**: Built HTML pages render without fonts, `globalStyles.client.css`, or any `<link rel="stylesheet">` originally injected through the `index.html` entry. The static manifest's `index.html` lookup returns `{}`.

**Root cause**: `createDirectiveClientAutoDiscover` (in 1.10.0 / 1.10.1) walked every `"use client"` file under `moduleBase` and added it as an explicit input — including `src/client.tsx`, which is also the conventional `<script type="module" src>` target in `index.html`. Vite drops its own `index.html` manifest entry when an explicit input overlaps with one of its script srcs, so `collectManifestCss(staticManifest, "index.html")` in `plugin/react-static/processCssFilesForPages.ts:34` returned an empty record and global CSS dropped out of every page.

**Fix (1.11.2 / PR #70)**: `createDirectiveClientAutoDiscover` now parses `<projectRoot>/index.html` once at discovery time and skips any candidate matching a `<script type="module" src="…">` entry. See `plugin/config/autoDiscover/createDirectiveClientAutoDiscover.ts:10-24, 60-79`. Vite continues to discover those modules via its own index.html input.

**If this recurs**: check whether a new code path adds `src/client.tsx` (or whatever the index.html script src resolves to) as an explicit Rollup input without going through `createDirectiveClientAutoDiscover`. Any input that overlaps an `index.html` script src will re-trigger the same manifest deduplication.

## Directive Errors

### Client Component Not Transformed

**Symptoms**: `export default not found` or client component renders as server component.

**Cause**: Missing `"use client"` directive. Files matching `.client.tsx` pattern are detected by filename as fallback, but explicit directives are more reliable.

### Mixed Directives Warning

**Symptoms**: Warning about `"use client"` and `"use server"` in same file.

**Fix**: Split into separate files. A file can only be one boundary type.

## Related Docs

- [DEBUGGING.md](./DEBUGGING.md) — verbose logging, profiling
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) — error patterns in source
- [TESTING.md](./TESTING.md) — test commands and setup
