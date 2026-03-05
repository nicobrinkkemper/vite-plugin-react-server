# Workers

> Contributor documentation. Covers the RSC and HTML worker implementations.

In dev mode with `react-server` condition, workers are **skipped by default** — RSC renders directly on the main thread via Vite's environment runner. Set `dev.useRscWorker: true` to force worker usage.

## RSC Worker

Renders React Server Components and handles server actions. Runs with `react-server` condition.

### Message Handling

```ts
parentPort?.on("message", async (message) => {
  switch (message.type) {
    case "RSC_RENDER":    await handleRscRender(message); break;
    case "SERVER_ACTION": await handleServerAction(message); break;
    case "CLEANUP":       await handleCleanup(message); break;
    case "SHUTDOWN":      await handleShutdown(message); break;
  }
});
```

### RSC Rendering Flow

1. Receive `RSC_RENDER` with element, moduleBaseURL, cssFiles
2. Call `renderToReadableStream` from `react-server-dom-esm/server`
3. Read chunks and send `RSC_CHUNK` messages to main thread
4. Send `RSC_END` with metrics on completion

### Server Action Flow

1. Receive `SERVER_ACTION` with actionId and args
2. Look up action function
3. Execute and send `SERVER_ACTION_RESPONSE`

## HTML Worker

Transforms RSC streams to HTML. Runs without `react-server` condition.

### Flow

1. Receive `ROUTE_READY` with module config and CSS
2. Receive `RSC_CHUNK` messages — feed into RSC-to-HTML transform
3. Receive `RSC_END` — finalize HTML
4. Send `HTML_CHUNK` messages as HTML is generated
5. Send `HTML_COMPLETE` when done

### Environment-Specific Paths

```ts
htmlWorkerPath: `server/html-worker.${
  process.env.NODE_ENV === "production" ? "production" : "development"
}.js`;
```

Development workers include:
- Verbose logging
- Stack traces in stream output
- MessageChannel-based loader communication

## Custom Workers

Replace built-in workers with custom implementations:

```ts
vitePluginReactServer({
  htmlWorkerPath: "./my-html-worker.js",
  rscWorkerPath: "./my-rsc-worker.js",
});
```

Custom workers must implement the same message protocol. They become part of your build output.

## Message Protocol

### Main → Worker

| Type | Fields | Purpose |
|------|--------|---------|
| `ROUTE_READY` | moduleRootPath, moduleBaseURL, cssFiles, pipeableStreamOptions | Initialize route render |
| `RSC_CHUNK` | chunk (ArrayBuffer) | RSC content chunk |
| `RSC_END` | — | End of RSC stream |
| `CLEANUP` | — | Free route resources |
| `SHUTDOWN` | — | Terminate worker (`id: "*"` for all) |

### Worker → Main

| Type | Fields | Purpose |
|------|--------|---------|
| `READY` | id, env | Worker initialized |
| `HTML_CHUNK` | chunk (ArrayBuffer), encoding | HTML output chunk |
| `HTML_COMPLETE` | success, html?, metrics? | Rendering done |
| `CHUNK_PROCESSED` | success | RSC chunk acknowledged |
| `ERROR` | error, errorInfo? | Error occurred |

## Timeout Configuration

| Option | Default | Purpose |
|--------|---------|---------|
| `rscTimeout` | 5000ms | RSC render completion |
| `htmlTimeout` | 15000ms | HTML generation completion |
| `rscWorkerStartupTimeout` | 5000ms | RSC worker ready signal |
| `htmlWorkerStartupTimeout` | 5000ms | HTML worker ready signal |

Timeouts are safety nets for infinite loops, not normal operation (typical renders complete in 5-30ms).
