# Maintenance Documentation

This directory contains **essential development documentation** for AI contributors working on the `vite-plugin-react-server` plugin itself. This is NOT user documentation.

## 📋 Essential Development Docs

1. **[Plugin Architecture](./PLUGIN_ARCHITECTURE.md)** - Internal architecture and component interactions
2. **[Common Issues](./COMMON_ISSUES.md)** - Frequently encountered problems and solutions
3. **[Error Handling](./ERROR_HANDLING.md)** - Error patterns and recovery strategies
4. **[Debugging](./DEBUGGING.md)** - Debugging techniques and tools
5. **[Testing](./TESTING.md)** - Test infrastructure and patterns

## 🔧 Recent Critical Fixes

### Transformer Server Component Hiding (Latest)

**Issue**: During static generation, server components (like `page.js`) were being loaded in non-server environments, causing "React Server Writer cannot be used outside a react-server environment" errors.

**Root Cause**: The transformer was missing logic to handle server components in non-server environments.

**Solution**: Added logic in `plugin/loader/createTransformer.ts` to detect server components in non-server environments and return empty modules:

```typescript
} else if (!isServerEnvironment && !loader?.isClientComponentByName?.(moduleId)) {
  // In non-server environments, server components should be hidden (return empty module)
  if (verbose) {
    logger.info(`[createTransformer:non-server] Hiding server component in non-server environment: ${moduleId}`);
  }
  return { code: "", map: null };
}
```

**Status**: ✅ **FIXED** - The transformer now correctly handles server components in non-server environments.

### Rollup React Module Resolution Issue (Current)

**Issue**: Build tests are failing with Rollup error: `"__require" is not exported by "react/index.js"` during the static build phase.

**Root Cause**: The static build phase uses a separate Rollup bundling step that has CommonJS/ESM interop issues with React modules.

**Status**: 🔄 **IN PROGRESS** - This affects the static build bundling phase.

## 🏗️ Plugin Structure

The plugin is organized into the following main components:

1. **Core Plugin** (`plugin/`) - Main plugin entry points and configuration
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
