# Plugin Helpers

This directory contains reusable helper functions that support the
`vite-plugin-react-server` architecture across different environments and
contexts. The public surface is the two barrels `index.server.ts` and
`index.client.ts` — most helpers are shared, and the few that differ honor the
`.server` / `.client` condition split (see the comment in `index.server.ts`
about why `resolveComponents.client` is never re-exported from the server
barrel).

## Architecture Overview

The plugin supports multiple rendering scenarios:

### Environments
- **Client**: Static generation, build-time rendering
- **Server**: Runtime rendering, SSR

### Contexts
- **Main Thread**: Direct component access, immediate rendering
- **Worker Thread**: Message-based communication, component loading

### Component Resolution Strategies
- **Direct**: Components passed directly (main thread)
- **From Paths**: Components loaded from file paths (worker thread)
- **Message-based**: Components requested via messages (distributed)

## Core Patterns

### 1. Main Thread vs. Worker Thread
- **Main Thread**: Can access React components directly, immediate rendering
- **Worker Thread**: Must load components from file paths, message-based communication

### 2. Stream Piping
- RSC streams flow from RSC generation to HTML transformation
- Server: RSC Stream → HTML Worker → HTML Stream
- Client: RSC Stream → Main Thread HTML Transform → HTML Stream
- Stream construction lives in `../stream/` (this directory no longer owns stream helpers)

## Helper Functions

The list below tracks the actual barrel exports. Keep it in sync when adding or
removing a helper.

### Route & file handling
- `getRouteFiles()`, `resolvePage()`, `resolveProps()`, `resolvePageAndProps()`
- `requestInfo()`, `requestToRoute()`

### Configuration & options
- `serializeUserOptions()`, `cleanObject()`, `inputNormalizer()`
- `hydrateUserOptions()`
- `createSerializableHandlerOptions()` - Extracts serializable parts for worker communication

### CSS handling
- `collectManifestCss()`, `collectViteModuleGraphCss()`, `createCssProps()`
- `createUnifiedCssProcessor()`

### Manifest & module handling
- `tryManifest()`, `getBundleManifest()`, `moduleRefs()`

### Render message helpers
- `validateRscRenderMessage()` - Validates RSC render message types
- `resolveRenderUrl()` - Resolves URLs for render operations
- `mergeMessageWithDefaults()` - Merges message values with defaults
- `resolveWithDefaultRootAndHtml()`
- `logRenderStart()` - Consistent logging across render contexts

### Component resolution
- `resolveComponents()` - server barrel (`resolveComponents.ts`)
- `resolveComponentsClient` - client barrel only (`resolveComponents.client.ts`)

### Pattern matching
- `createPatternMatcher()`

### Metrics
- `formatMetrics()`, `logMetrics()` (re-exported from `../metrics/`)

### Server action handling
- `handleServerAction()` - resolves to `.server` / `.client` per condition

## Key Insights

1. **Environment Separation**: Client and server environments have different constraints and capabilities
2. **Thread Model**: Main thread vs. worker thread determines component access patterns
3. **Condition Split**: Under `--conditions react-server`, ESM static linking
   evaluates a module's transitive deps, so client-only helpers must never be
   re-exported from a `.server` barrel (see `index.server.ts`).
4. **Serialization**: Only serializable data can be passed between threads
5. **Component Loading**: Workers must load components from file paths, not direct references
