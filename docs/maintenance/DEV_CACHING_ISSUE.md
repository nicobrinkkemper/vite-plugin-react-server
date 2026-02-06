# Dev Mode Module Caching Issue

## Problem Statement

In development mode, modules loaded by the RSC worker are cached by Node.js's ESM system. When files change:
1. HMR correctly updates `hmrState` with `invalidated: true`
2. The worker's internal cache (`temporaryReferences`) can be cleared
3. **BUT** Node.js's ESM cache still returns the old module on `import()`

This causes:
- Props returning stale data (database queries not re-run)
- Server action changes not reflecting
- CSS changes not updating (when imported by server components)

## Root Cause

In `plugin/worker/rsc/messageHandler.tsx` and `plugin/helpers/createSharedLoader.ts`, modules are imported via:

```js
const result = await import(fileUrl);
```

Node.js caches ESM imports. Even if `hmrState` marks the module as invalidated, the `import()` returns the cached version.

## Proper Fix

When importing a module that has been invalidated via HMR, append a cache-busting query parameter using the HMR timestamp:

### 1. In `createSharedLoader.ts`

```ts
import { hmrState } from "../worker/rsc/state.js"; // or pass as parameter

// When importing:
const hmrInfo = hmrState?.get(normalizedPath);
const importUrl = hmrInfo?.invalidated && hmrInfo?.timestamp 
  ? `${fileUrl}?t=${hmrInfo.timestamp}` 
  : fileUrl;
const result = await import(importUrl);
```

### 2. In `createRscWorkerLoader.ts`

Pass the `hmrState` to the loader so it can bust cache for invalidated modules.

### 3. Alternative: Re-import after HMR

When `HMR_UPDATE` is received, instead of just marking as invalidated, force a fresh import:

```ts
// In state.ts HMR handler
if (msg.type === "HMR_UPDATE") {
  const normalizedPath = relative(workerData.userOptions?.projectRoot, msg.path);
  hmrState.set(normalizedPath, {
    timestamp: Date.now(),
    invalidated: true,
    routes: msg.routes || [],
  });
  
  // Clear component cache
  clearCachedComponent(normalizedPath);
  
  // Pre-emptively bust Node's module cache by importing with new timestamp
  // This ensures next import gets fresh module
}
```

## Constraints

1. **Keep both dev modes equal**: `dev:ssr` (client-first) and `dev:rsc` (server-first) should have the same developer experience
2. **Worker architecture must stay**: Workers provide react-server condition isolation
3. **Don't break production builds**: Cache busting is only for development

## Files to Modify

1. `plugin/helpers/createSharedLoader.ts` - Add cache busting based on HMR state
2. `plugin/worker/rsc/createRscWorkerLoader.ts` - Pass HMR state to loader
3. `plugin/worker/rsc/state.ts` - Consider clearing Node cache on HMR

## Testing

After fix:
1. Start `npm run dev:rsc`
2. Edit a `.server.ts` file → changes should reflect without restart
3. Edit CSS imported by server component → should hot reload
4. Edit props file with database call → should return fresh data on refresh

## Related Docs

- [Worker System](../rsc-worker.md)
- [Core Concepts](../core-concepts.md) - dev:rsc vs dev:ssr modes
- [Advanced Topics](../advanced-topics.md) - HMR message types
