# Maintenance Documentation

This directory contains maintenance documentation for the `vite-plugin-react-server` project.

## 📋 Table of Contents

1. **[Plugin Architecture](./PLUGIN_ARCHITECTURE.md)** - Internal architecture and component interactions
2. **[Transformer System](./TRANSFORMER_SYSTEM.md)** - Component transformation logic and rules
3. **[Build Orchestration](./BUILD_ORCHESTRATION.md)** - Static generation and build processes
4. **[Environment Management](./ENVIRONMENT_MANAGEMENT.md)** - Client/Server environment handling
5. **[Worker System](./WORKER_SYSTEM.md)** - RSC worker architecture and communication
6. **[Recent Issues & Fixes](./RECENT_ISSUES.md)** - Recent problems and their solutions

## 🔧 Recent Fixes

### Transformer Server Component Hiding (Latest)

**Issue**: During static generation, server components (like `page.js`) were being loaded in non-server environments, causing "React Server Writer cannot be used outside a react-server environment" errors.

**Root Cause**: The transformer was missing logic to handle server components in non-server environments. Previously, it would simply hide server components (return empty modules) when encountered in non-server environments, but recent changes removed this behavior.

**Solution**: Added logic in `plugin/loader/createTransformer.ts` to detect server components in non-server environments and return empty modules:

```typescript
} else if (!isServerEnvironment && !loader?.isClientComponentByName?.(moduleId)) {
  // In non-server environments, server components should be hidden (return empty module)
  // This prevents server components from being loaded in client/ssr environments
  if (verbose) {
    logger.info(`[createTransformer:non-server] Hiding server component in non-server environment: ${moduleId}`);
  }
  return { code: "", map: null };
}
```

**Files Modified**:
- `plugin/loader/createTransformer.ts` - Added server component hiding logic

**Testing**: The fix resolves the React Server Writer error and allows static generation to proceed to the next phase. The transformer now properly hides server components in non-server environments by returning `export default null;` instead of trying to load them.

**Status**: ✅ **FIXED** - The original "React Server Writer cannot be used outside a react-server environment" error is resolved. The transformer now correctly handles server components in non-server environments.

### Rollup React Module Resolution Issue (Current)

**Issue**: Build tests are failing with Rollup error: `"__require" is not exported by "react/index.js"` during the static build phase.

**Environment Context**: 
- ✅ **client environment** - Builds successfully
- ✅ **ssr environment** - Builds successfully  
- ✅ **server environment** - Builds successfully
- ❌ **static build phase** - Fails with Rollup React module resolution error

**Root Cause**: The static build phase uses a separate Rollup bundling step that has CommonJS/ESM interop issues with React modules. The error occurs when Rollup tries to bundle React for the static generation process.

**Affected Tests**: All build-related tests (12/16 tests failing)

**Status**: 🔄 **IN PROGRESS** - This is a separate issue from the transformer problem and affects the static build bundling phase.

## 🏗️ Plugin Structure

The plugin is organized into the following main components:

1. **Core Plugin** (`plugin/`) - Main plugin entry points and configuration
   - `plugin/index.ts` - Main plugin entry point
   - `plugin/plugin.client.ts` - Client-side plugin logic
   - `plugin/plugin.server.ts` - Server-side plugin logic
2. **Transformer Plugin** (`plugin/transformer/`) - Handles component transformations
3. **Loader System** (`plugin/loader/`) - Module loading and transformation
4. **React Static** (`plugin/react-static/`) - Static generation and build processes
5. **Dev Server** (`plugin/dev-server/`) - Development server
6. **Worker System** (`plugin/worker/`) - RSC worker system
7. **Event System** (`plugin/events/`) - Inter-plugin communication
8. **CSS Handling** (`plugin/css/`) - CSS processing

## 🧪 Testing

Run tests with:
```bash
# Server tests
npm run test:server -- ./test/examples

# Client tests  
npm run test:client -- ./test/examples

# All tests
npm run test -- ./test/examples
```

## 📝 Contributing

When making changes to the plugin:

1. Update relevant documentation in this directory
2. Add test cases for new functionality
3. Ensure all tests pass before submitting changes
4. Document any breaking changes or new configuration options
