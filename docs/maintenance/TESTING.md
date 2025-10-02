# Testing

This project uses Vitest and React conditions to test both server and client implementations. Tests are organized by intent (server, client, examples) and selectively included based on the current Node.js condition.

## Key Ideas
- Server-only tests run under the `react-server` condition
- Client tests run under the default condition (`null`)
- Example tests validate end-to-end plugin usage patterns and can be executed under both conditions when needed

## Current Test Suite Status (January 2025)

The testing infrastructure has been modernized and is now fully functional. Here's the current status:

### ✅ **test/examples/** - **FULLY WORKING**
- **Status**: All tests passing (95+ tests)
- **Coverage**: End-to-end plugin functionality, build processes, worker communication, RSC streaming
- **Tests**: 23+ test files covering real-world usage scenarios
- **Features**: Cross-environment testing, preserveModulesRoot functionality, race condition handling
- **Recommendation**: **Primary test suite** - comprehensive coverage of plugin functionality

### ✅ **test/unit/** - **FULLY WORKING**  
- **Status**: All tests passing (324+ tests)
- **Coverage**: Individual functions, utilities, configuration, stream processing
- **Features**: Unit testing, regression prevention, isolated function testing
- **Recommendation**: Reliable for unit testing and regression prevention

### ✅ **test/dev/** - **FULLY WORKING**
- **Status**: All tests passing (11 tests)
- **Coverage**: Development server functionality, RSC streaming, props handling
- **Features**: Live dev server testing, HTTP request handling, server-specific functionality
- **Recommendation**: Use for development server and server-specific testing

### ✅ **test/client/** - **ORGANIZED**
- **Status**: Content properly organized across test directories
- **Coverage**: Client-side functionality integrated into examples and unit tests
- **Recommendation**: Use test/examples for client-side testing scenarios

## Vitest Configuration
Tests are dynamically included/excluded based on condition:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { getCondition } from "vite-plugin-react-server/config";

export default defineConfig({
  mode: "development",
  test: {
    globals: true,
    hookTimeout: 10000,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.*"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      ...(getCondition() !== "react-server" ? ["test/unit/**/*.test.*", "test/server/**/*.test.*"] : []),
    ],
  },
});
```

## Test Commands
Use the provided scripts to target specific suites:

```bash
# All tests - same as test:both
npm run test

# Server tests (forces react-server condition)
npm run test:server

# Client tests (run under non react-server condition)
npm run test:client

# Example tests (run under both server and client where applicable) - RECOMMENDED
npm run test:examples

# Development server tests (server-specific functionality)
npm run test:dev

# Unit tests (forced react-server condition) - RELIABLE
npm run test:unit

# Typecheck
npm run test:typecheck
```

### **Recommended Test Workflow (January 2025)**

✅ **Current Status**: Test infrastructure is fully functional and stable.

For development and CI, use these commands in order of priority:

1. **`npm run test:unit`** - Unit tests (324+ passing) - **RECOMMENDED**
2. **`npm run test:examples`** - End-to-end tests (95+ passing) - **RECOMMENDED**
3. **`npm run test:dev`** - Development server tests (11 passing) - **STABLE**
4. **`npm run test:typecheck`** - Type safety verification - **STABLE**

**Note**: All test suites are now fully functional. The worker thread communication has been stabilized and all tests are passing consistently.

## Test Script Patterns

### Cross-Environment Tests
```bash
# Test both environments (cold start comparison)
npm run test:both-cold

# Test both environments
npm run test:both

# Test specific test file across environments
npm run test:both -- ./test/examples/build
npm run test:both-cold -- ./test/streams
```

### Build Commands
```bash
# Build the plugin (vite build + patch permissions)
npm run build:vite

# Full build (clean + types + vite build)
npm run build
```

### Specific Test Suites
```bash
# Unit tests
npm run test:unit

# Build tests
npm run test:build

# Error boundary tests
npm run test:error-boundaries

# Server action tests
npm run test:server-action
npm run test:server-action-client
npm run test:server-action-integration

# Coverage
npm run test:coverage
```

## Performance Benchmarks

**Environment API Performance Comparison:**

**Test Examples (test:both-cold -- test/examples):**
```
🕒 Timing details:
❄️  Cold start (warm-up) phase:
  🔧 Server:    Duration  6.00s (transform 1.14s, setup 393ms, collect 10.91s, tests 35.84s, environment 2ms, prepare 1.15s)
  🌐 Client:    Duration  6.97s (transform 1.05s, setup 422ms, collect 11.34s, tests 44.25s, environment 2ms, prepare 1.37s)
🔥 Actual test phase:
🔧 Server:    Duration  5.93s (transform 1.09s, setup 350ms, collect 10.73s, tests 34.65s, environment 2ms, prepare 1.27s)
🌐 Client:    Duration  6.52s (transform 1.06s, setup 332ms, collect 11.59s, tests 38.53s, environment 2ms, prepare 1.23s)
```

**Stream Tests (test:both-cold -- test/streams):**
```
🕒 Timing details:
❄️  Cold start (warm-up) phase:
  🔧 Server:    Duration  933ms (transform 266ms, setup 42ms, collect 576ms, tests 586ms, environment 0ms, prepare 88ms)
  🌐 Client:    Duration  1.01s (transform 273ms, setup 52ms, collect 587ms, tests 691ms, environment 0ms, prepare 98ms)
🔥 Actual test phase:
🔧 Server:    Duration  900ms (transform 252ms, setup 46ms, collect 556ms, tests 517ms, environment 0ms, prepare 91ms)
🌐 Client:    Duration  980ms (transform 275ms, setup 61ms, collect 569ms, tests 750ms, environment 0ms, prepare 97ms)
```

**Key Performance Insights:**
- Server-first mode is consistently faster (5.93s vs 6.52s for examples)
- Server-first mode has better cold start performance
- Both modes maintain similar performance characteristics across test suites
- Transform and setup times are comparable between modes
- Collection and test execution times show the main performance differences

## Test Layout

- `test/examples/**`: ✅ **PRIMARY** - High-level, end-to-end examples demonstrating plugin usage
- `test/unit/**`: ✅ **RELIABLE** - Individual function tests, utilities, configuration
- `test/server/**`: ❌ **OUTDATED** - Legacy server tests (avoid until updated)
- `test/client/**`: ⚠️ **EMPTIED** - Content moved to test/examples
- `test/fixtures/**`: Build fixtures and generated assets

## Common Test Patterns

- **Client tests**: Use `doBuild` helper to test static generation
- **Server tests**: Test SSR pipeline and server-only features
- **Example tests**: End-to-end plugin usage with real HTML/RSC output

## When to Put Tests in Examples vs Unit vs Server (Updated December 2024)

### **test/examples/** - **RECOMMENDED FOR MOST CASES**
- End-to-end plugin functionality
- Build process validation  
- Worker thread communication
- Real-world usage scenarios
- Integration with Vite plugins
- Both server and client functionality

### **test/unit/** - **FOR ISOLATED FUNCTIONALITY**  
- Individual function testing
- Utility functions
- Configuration parsing
- Stream processing logic
- Error handling
- Module resolution

### **test/server/** - **AVOID UNTIL UPDATED**
- Legacy server tests that need refactoring
- May fail due to new worker architecture
- Use test/examples for server functionality instead

### **test/client/** - **DEPRECATED**
- Content moved to test/examples
- Use test/examples for client-side testing

## Writing New Tests
- react-server condition for unit tests
- Use `onEvent` and `onMetrics` hooks to assert observability rather than reading files
- Use fixtures and the `doBuild` helper to standardize builds

## CI Guidance (Updated December 2024)

### **Recommended CI Pipeline (Updated for Current Status)**

1. **`npm run build`** - Must complete without type warnings
2. **`npm run test:unit`** - Most reliable test coverage (313/313 passing)
3. **`npm run test:typecheck`** - Type safety validation
4. **`npm run test:examples`** - ⚠️ Optional (many timeouts, use with extended timeout)

### **CI Best Practices (Revised for Current Issues)**

- **Fast Path**: Run `test:unit` and `test:typecheck` on every push (most reliable)
- **Full Build**: Some tests require `npm run build:vite` as pre-step (doesn't run full `tsc`)
- **React Server Condition**: `npm run test` runs vitest with react-server condition (same as `test:server`)
- **Avoid Legacy**: Skip `test:server` and `test:client` until they're updated
- **Test Timeouts**: Increase timeout for `test:examples` if used in CI (many tests timeout at 5-15s)
- **Script Combination**: If npm script contains `&`, don't combine with additional commands

### **CI Performance Notes (Updated for Current Reality)**

- `test:unit` runs in ~2-3 seconds with minimal dependencies - **RELIABLE**
- `test:examples` currently experiencing timeouts (5-15s each) - **UNSTABLE**
- Both test suites are environment-aware and work under both conditions
- Use `test:both-cold` for cross-environment validation when needed
- **Current Issue**: Worker thread communication problems cause test instability

## Common Testing Mistakes

### ❌ Wrong - Assuming Global Install of Vitest
```sh
vitest ./test/examples/build
NODE_OPTIONS='--conditions react-server' vitest ./test/examples/build
```

### ✅ Correct - Use npx
```sh
npx vitest ./test/examples/build
NODE_OPTIONS='--conditions react-server' npx vitest ./test/examples/build
```

### ❌ Wrong - The Examples Script Already Contains Arguments
```sh
npm run test:examples -- ./test/examples/build
```

### ✅ Correct - Use test:both Script Directly
```sh
npm run test:both -- ./test/examples/build
```

### ❌ Wrong - --timeout is Not an Argument
```sh
npx vitest ./test/examples/build --timeout 60000
```

### ✅ Correct - Handle Timeouts Properly
```sh
# Option 1: Change vitest config hookTimeout and testTimeout directly
# Option 2: Solve underlying timeout issue (shouldn't happen in first place)
# Option 3: Use unix timeout utility
timeout 10s npm run test:both -- ./test/examples/build
```

### ❌ Wrong - Importing from Source Files in Tests
```typescript
// This causes pluginRoot to resolve incorrectly and worker path errors
const { reactServerPlugin } = await import("../plugin/react-server/plugin.js");
const { reactStaticPlugin } = await import("../plugin/react-static/plugin.js");
```

### ✅ Correct - Import from Built Plugin Files
```typescript
// Always use the same import paths that end users would use
const { reactServerPlugin } = await import("vite-plugin-react-server");
const { reactStaticPlugin } = await import("vite-plugin-react-server/static");
```

**Why**: When testing plugin functionality, always import from built files (like end users do) rather than source files. Importing from source files causes `pluginRoot` to resolve to the source directory instead of the built location, leading to worker path resolution errors.

**Symptom**: If `pluginRoot` resolves to `src/` or `plugin/` directory instead of the expected built location, you're likely importing from source files.
