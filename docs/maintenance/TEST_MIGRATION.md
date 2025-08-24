# Test Migration Guide

## Summary

This document outlines the strategy for migrating existing tests from `test/client/` and `test/server/` directories to `test/examples/` to ensure cross-environment compatibility.

## Migration Strategy

### Phase 1: High Priority Tests (Completed)
- [x] Error Boundaries
- [x] Server Action Integration
- [x] RSC Worker

### Phase 2: Medium Priority Tests
- [ ] Custom Loader Paths (Client dev server specific - keep in test/client/)
- [ ] Build Process
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

## Notes

- Custom Loader Paths test remains in `test/client/` as it's client dev server specific
- All migrated tests now work in both client and server environments
- Cross-environment compatibility ensures tests validate the plugin's behavior across different React environments
