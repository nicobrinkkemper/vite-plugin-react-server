## Runtime Modes

The plugin supports two runtime patterns for RSC requests during development:

### Client Condition (default)

- Uses the `rsc-worker` to execute server-condition logic outside the main thread.
- Keeps the main thread free and isolates experimental server dependencies.

### Server Condition

- Runs RSC rendering in the main thread.
- Streams headless RSC responses directly without a worker.

### Forcing Main Thread in Client Mode

If you want to align client mode behavior with server mode (at the cost of running more logic in the main thread), set:

```ts
export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    Page: "src/page.tsx",
    rscRuntime: "main-thread",
    rscTimeoutMs: 5000,
  }),
});
```

This keeps the RSC request orchestration and user options consistent across both client and server conditions, while still allowing you to switch conditions via `NODE_OPTIONS`.
