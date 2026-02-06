# Dev Mode HMR Issues

## Solution Summary

**The fix**: Skip the RSC worker in dev mode. Use Vite's environment runner for direct rendering on the main thread, which properly handles module cache invalidation via Vite's module graph.

- Set via `dev.useRscWorker: false` (default)
- Worker is still used for production builds
- See `configureReactServer.server.ts` for implementation

## Two Related Problems (Historical Context)

### Problem 1: Server-side Module Caching

In development mode, modules loaded by the RSC worker are cached by Node.js's ESM system. When files change:

### Problem 2: Missing Client-side HMR Handler

The server sends WebSocket events on file changes:
```js
server.ws.send({
  type: 'custom',
  event: 'vite-plugin-react-server:server-component-update',
  data: { file, path }
});
```

**But no client-side code listens for this event!** The RSC stream is never refetched.

## How Vite HMR Works

1. `/@vite/client` is injected into the page
2. It connects via WebSocket to dev server
3. Server sends update events
4. Client handles updates (CSS injection, module reload, etc.)

For RSC to work similarly, we need client-side code that:
```ts
if (import.meta.hot) {
  import.meta.hot.on('vite-plugin-react-server:server-component-update', async (data) => {
    // Refetch RSC stream
    const response = await fetch(window.location.pathname + '.rsc');
    // Update React tree with createFromFetch
  });
}
```

---

## Problem 1 Details: Server-side Caching

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

---

## Problem 2 Fix: Client-side HMR Handler

The plugin needs to inject or provide client-side code that handles RSC HMR.

### Option A: Virtual Module (Recommended)

Create a virtual module `virtual:vite-plugin-react-server/hmr` that users import in their client entry:

```ts
// plugin/virtual/hmr-client.ts
export function setupRscHmr(refetch: () => Promise<void>) {
  if (import.meta.hot) {
    import.meta.hot.on('vite-plugin-react-server:server-component-update', async () => {
      await refetch();
    });
  }
}
```

User's client.tsx:
```tsx
import { setupRscHmr } from 'virtual:vite-plugin-react-server/hmr';
import { createFromFetch } from 'react-server-dom-esm/client';

// ... existing code ...

if (import.meta.hot) {
  setupRscHmr(async () => {
    // Refetch and update
    const response = fetch(window.location.pathname, {
      headers: { Accept: 'text/x-component' }
    });
    const newRoot = await createFromFetch(response);
    // Update React tree
  });
}
```

### Option B: Auto-inject via transformIndexHtml

The plugin could auto-inject HMR handling script:

```ts
// In plugin
transformIndexHtml(html) {
  if (process.env.NODE_ENV === 'development') {
    return html.replace('</body>', `
      <script type="module">
        if (import.meta.hot) {
          import.meta.hot.on('vite-plugin-react-server:server-component-update', () => {
            window.location.reload(); // Simple approach
          });
        }
      </script>
    </body>`);
  }
  return html;
}
```

### Option C: Enhance createReactFetcher

Make `createReactFetcher` automatically set up HMR:

```ts
export function createReactFetcher(options) {
  // ... existing code ...
  
  // Set up HMR if available
  if (import.meta.hot) {
    import.meta.hot.on('vite-plugin-react-server:server-component-update', async (data) => {
      // Invalidate and refetch affected routes
      const affectedRoute = data.routes?.[0] || window.location.pathname;
      // Trigger React to refetch
    });
  }
  
  return fetcher;
}
```

## Files to Modify (Client-side)

1. Create `plugin/virtual/hmr-client.ts` or add to existing virtual modules
2. Update `plugin/index.ts` to register the virtual module
3. Update docs to show how to enable RSC HMR in client entry

## Related Docs

- [Worker System](../rsc-worker.md)
- [Core Concepts](../core-concepts.md) - dev:rsc vs dev:ssr modes
- [Advanced Topics](../advanced-topics.md) - HMR message types
