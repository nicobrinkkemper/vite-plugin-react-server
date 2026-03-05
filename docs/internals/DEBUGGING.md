# Debugging Guide

## Verbose Logging

Enable verbose output in plugin options:

```typescript
vitePluginReactServer({
  verbose: true,
  // ...
})
```

This enables `[createTransformer]`, `[createRscStream]`, `[analyzeModule]` prefixed logs throughout the pipeline.

## Build Events

The `onEvent` callback reports build lifecycle events:

```typescript
// In tests or custom build scripts
const events = await doBuild({
  onEvent: (event) => {
    if (event.type === 'route.error') {
      console.error('Failed route:', event.data.route);
    }
  },
  onMetrics: (metrics) => {
    console.log(metrics);
  },
});
```

Event types are defined in `plugin/stream/createRenderToPipeableStreamHandler.types.ts`.

## Directive Issues

If components aren't transforming correctly, check directive analysis:

```bash
# Run with verbose to see directive detection
NODE_OPTIONS='--conditions react-server' npx vitest ./test/examples/build --reporter=verbose
```

The `panicThreshold` option controls whether directive warnings become errors:
- `"first_error"` (default in production): throws on first warning
- `"none"` (default in development): downgrades errors to warnings

## Dev Mode

Dev mode uses Vite's Environment API runner (no workers). Debug with:

1. Browser DevTools → Network tab for RSC stream responses
2. Browser console for `[RSC HMR]` prefixed messages (client-side HMR events)
3. Terminal for `[hotUpdate]` logs from `plugin.server.ts` and `plugin.client.ts`

## Node.js Profiling

```bash
# CPU profile
node --prof node_modules/.bin/vite build --app
node --prof-process isolate-*.log > profile.txt

# Heap snapshot
node --inspect node_modules/.bin/vite build --app
# Then use Chrome DevTools → Memory tab
```

## Common Pitfalls

- **Empty RSC output**: Usually means the Page component threw during render. Check `onEvent` for `route.error` events.
- **HMR not working**: Check that `@vitejs/plugin-react` is listed *before* `vitePluginReactServer()` in the Vite config.
- **Module not found in dev**: The `react-server-dom-esm` symlink may be missing. Delete `node_modules/.vite` and restart.
- **Build hangs**: Usually a stream that never closes. Run with `--verbose` and check which page is last logged.
