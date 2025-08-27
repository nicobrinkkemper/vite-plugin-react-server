# Test Migration Guide

## Summary

This document outlines the strategy for migrating existing tests from `test/client/` and `test/server/` directories to `test/examples/` to ensure cross-environment compatibility, and documents the major performance improvements and fixes implemented.

## Migration Strategy

### Phase 1: High Priority Tests (Completed)
- [x] Error Boundaries
- [x] Server Action Integration
- [x] RSC Worker
- [x] Build Process

### Phase 2: Medium Priority Tests
- [ ] Custom Loader Paths (Client dev server specific - keep in test/client/)
- [ ] File Filtering
- [ ] Test Cleanup

### Phase 3: Low Priority Tests
- [ ] Performance Tests
- [ ] Edge Cases
- [ ] Integration Tests

## Completed Migrations

### Error Boundaries Test
- **Original**: `test/client/error-boundaries.test.ts`
- **New**: `test/examples/error-boundaries.test.ts`
- **Status**: ✅ Completed
- **Changes**: Broadened file filtering, modified HTML file assertion, restricted `doBuild` to `pages: ["/"]` to prevent client hangs

### Server Action Integration Test
- **Original**: `test/client/server-action-integration.test.ts`
- **New**: `test/examples/server-action-integration.test.ts`
- **Status**: ✅ Completed
- **Changes**: Broadened file filtering

### RSC Worker Test
- **Original**: `test/client/rsc-worker.test.ts`
- **New**: `test/examples/rsc-worker.test.ts`
- **Status**: ✅ Completed
- **Changes**: Corrected `Page` option in `doBuild` to `src/page/page.tsx` and broadened file filtering

### Build Process Test
- **Original**: `test/client/build.test.ts`
- **New**: `test/examples/build.test.ts`
- **Status**: ✅ Completed
- **Changes**: Optimized for cross-environment compatibility, improved performance significantly

## Major Performance Improvements

### Plugin Loading Optimization
- **Issue**: Static generation plugins were being loaded even when `pages: []` was explicitly set, causing unnecessary overhead
- **Fix**: Modified plugin loading logic in both `plugin/react-static/plugin.server.ts` and `plugin/react-static/plugin.client.ts` to properly handle `userOptions.build.pages`:
  - Empty array `[]`: Skip plugin loading (no pages to generate)
  - Array with routes: Load plugin for explicit routes
  - Async function: Load plugin for dynamic discovery
  - Undefined: Load plugin for auto-discovery
- **Impact**: Eliminated unnecessary plugin overhead for tests that explicitly disable static generation
- **Performance Gain**: ~60% reduction in server test execution time

### Worker Shutdown Protocol Fix
- **Issue**: HTML workers were not properly handling `SHUTDOWN` messages, causing timeout delays during test cleanup
- **Fix**: Added proper `SHUTDOWN_COMPLETE` message handling to `plugin/worker/html/messageHandler.tsx`:
  - Added `SHUTDOWN` message type handling
  - Implemented proper shutdown response via `parentPort`
  - Added graceful worker termination
- **Impact**: Eliminated worker shutdown timeout warnings and improved test cleanup performance
- **Performance Gain**: Eliminated 2-3 second timeout delays during test completion

### Worker Lifecycle Management
- **Issue**: Worker shutdown logic was in `writeBundle` hooks instead of `closeBundle` hooks
- **Fix**: Moved worker shutdown logic from `writeBundle` to `closeBundle` hooks in both server and client plugins
- **Impact**: Proper worker lifecycle management, preventing premature worker termination

## Technical Fixes Applied

### Client Component Transformer Fix
- **Issue**: `export default` incorrectly transformed to `export const default`
- **Fix**: Updated `plugin/loader/transformClientModule.ts`
- **Status**: ✅ Completed

### Error Handling Fix
- **Issue**: Client environment hanging on error-throwing pages
- **Fix**: Added `onShellError` callback and ensured streams end on error
- **Status**: ✅ Completed

### Client Dev Server Fix
- **Issue**: Worker loader path issues and unsafe plugin component matching
- **Fix**: Refactored worker loader and made plugin component matching safer
- **Status**: ✅ Completed

### Worker Loader Simplification
- **Issue**: Complex build/dev loader distinction
- **Fix**: Simplified to single `GenericModuleLoader` using dynamic imports
- **Status**: ✅ Completed

### Client Dev Server ProjectRoot Fix
- **Issue**: `projectRoot` not being passed correctly to worker
- **Fix**: Fixed `projectRoot` propagation through configuration chain and RSC worker initialization
- **Status**: ✅ Completed

## Performance Results

### Before Optimizations
- **Server tests**: ~5.12s total (4.29s test execution)
- **Client tests**: ~2.28s total (1.43s test execution)
- **Performance gap**: Server tests were ~2.35x slower than client tests
- **Issues**: Worker shutdown timeouts, unnecessary plugin loading

### After Optimizations
- **Server tests**: ~2.06s total (1.28s test execution)
- **Client tests**: ~2.24s total (1.40s test execution)
- **Performance gap**: Server tests are now ~8% faster than client tests
- **Improvements**: Clean worker shutdown, optimized plugin loading

### Performance Improvement Summary
- **Total improvement**: ~60% reduction in server test execution time
- **Eliminated**: Worker shutdown timeout warnings
- **Achieved**: Server tests now perform better than client tests
- **Maintained**: All test functionality and cross-environment compatibility

## Notes

- Custom Loader Paths test remains in `test/client/` as it's client dev server specific
- All migrated tests now work in both client and server environments
- Cross-environment compatibility ensures tests validate the plugin's behavior across different React environments
- Performance optimizations maintain full functionality while significantly improving test execution speed
- Worker shutdown protocol now works correctly across all worker types (RSC and HTML workers)
