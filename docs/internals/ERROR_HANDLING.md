# Error Handling

The plugin has a structured error system in `plugin/error/`. Here's how it works.

## Panic Threshold

The central concept is `panicThreshold` — a config option that controls whether errors stop the build or get swallowed:

| Value | Behavior |
|-------|----------|
| `"none"` | Log errors, continue processing (default in dev) |
| `"critical_errors"` | Only throw errors marked as `critical` |
| `"all_errors"` | Throw on any error |

Errors marked for panic carry `Symbol.for('vite-plugin-react-server.panic')`. Use `isPanic(error)` or `assertPanic(error)` to check/throw.

## Error Flow

### Stream errors (RSC + HTML rendering)

`createRenderToPipeableStreamHandler.server.ts` is the main consumer. React's `onError` and `onShellError` callbacks feed into `handleError()`:

```
React onError/onShellError
  → handleError({ error, errorInfo, panicThreshold, critical })
    → toError(error)         — normalize unknown → Error
    → logError(err, logger)  — format and log via Vite logger
    → if should panic: mark with PANIC_SYMBOL, return error to throw
    → else: return null (continue)
```

### Worker errors (production builds)

Workers serialize errors across the thread boundary:

```
Worker thread: serializeError(error) + serializeErrorInfo(errorInfo)
  → post message to main thread
Main thread: toError(serialized) → handleError(...)
```

`serializeError` extracts `message`, `stack`, `name`, `cause`, `breadcrumbs` and the panic symbol into a plain object. `serializeErrorInfo` extracts React's `componentStack` and `digest`.

### Directive errors (compile time)

`createTransformer.ts` checks `panicThreshold`:
- `"none"` in dev: directive warnings logged, not thrown
- Otherwise: `throw new Error(warning.message)`

Error constants live in `directiveError.ts` (`DIRECTIVE_ERRORS.FILE_LEVEL`, `DIRECTIVE_ERRORS.FUNCTION_LEVEL`).

### Global handler

`setupGlobalErrorHandler` (used in `configureRequestHandler.client.ts`) attaches `uncaughtException` and `unhandledRejection` handlers during dev server lifetime. `cleanupGlobalErrorHandler` removes them on server close.

**Issue**: `cleanupGlobalErrorHandler` calls `process.removeAllListeners("uncaughtException")` — this removes ALL listeners, not just the ones it added. Could strip other handlers (Vite's own, test frameworks, etc.).

## Core Utilities

| Module | Purpose |
|--------|---------|
| `toError.ts` | Normalize any thrown value into an `Error` — handles strings, nulls, empty objects, serialized worker errors, nested `.error`/`.reason` shapes |
| `handleError.ts` | Log + panic decision. Deduplicates repeated identical errors. |
| `logError.ts` | Format error for Vite logger (dev: full stack, prod: message only) |
| `enhanceError.ts` | Wrap errors with `[context:error]` prefix and `cause` chain. **Currently unused.** |
| `assertPanic.ts` | `asserts error` — rethrows if error has panic symbol. **Currently unused.** |
| `shouldPanic.ts` | Pure logic: should this error panic given threshold + critical flag? |
| `panicThresholdHandler.ts` | `shouldCausePanic()` — used by static generation (`renderPages`, `plugin.server`, `plugin.client`) to decide whether to throw after batch rendering. |
| `serializeError.ts` | Error → plain object for worker `postMessage` |
| `serializeErrorInfo.ts` | React ErrorInfo → plain object for worker `postMessage` |
| `directiveError.ts` | Directive error message constants |

## Unused Code

`enhanceError`, `assertPanic`, and `createContextualError` have been removed (zero consumers).
