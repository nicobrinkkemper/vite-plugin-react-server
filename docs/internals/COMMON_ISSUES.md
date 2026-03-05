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
