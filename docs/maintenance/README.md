# Maintenance Guide

This guide covers maintenance tasks, troubleshooting, and development practices for the vite-plugin-react-server project.

## Table of Contents

- [Testing](./TESTING.md) - Testing practices and test infrastructure
- [Current Refactor Status](#current-refactor-status) - Recent progress and ongoing work
- [Worker Thread Communication](#worker-thread-communication) - Main thread <> worker thread architecture
- [Traditional Build Compatibility](#traditional-build-compatibility) - Supporting legacy Vite build patterns

## Current Refactor Status

The project is currently undergoing a major refactor to improve worker thread communication and modernize the testing infrastructure.

### ✅ **Completed Work**

#### **Client-side Static Generation**
- **Fixed HTML Stream Generation**: HTML stream now works correctly and produces content (138 bytes vs 0 bytes before)
- **Fixed RSC Content Structure**: RSC worker correctly generates full HTML structure with CSS data (1,518 bytes)
- **Implemented Proper Worker Pattern**: Successfully replicated the server-side worker pattern for client-side
- **Fixed Stream Processing**: RSC chunks are now properly accumulated and processed to HTML
- **Fixed Timing Issues**: Resolved critical timing issue where HTML content was being pushed after file writer completion
- **All Tests Passing**: Client-side metrics tests are now passing successfully

#### **Worker Thread Communication Architecture**
- **Two-Port Communication**: Implemented clean separation between data and control channels
- **Message Port Streams**: Created `MessagePortWritable` and `MessagePortReadable` for stream-based communication
- **Worker Thread Isolation**: Proper isolation between RSC worker and HTML worker threads
- **File Writing Coordination**: Improved coordination between worker threads and main thread for file operations

### 🔄 **Currently Working On**

#### **Test Infrastructure Modernization**
- **test/examples**: ⚠️ **PARTIALLY WORKING** - Some tests pass, but experiencing timeout issues (13 failed, 17 passed)
- **test/server**: ❌ **Outdated** - Legacy tests that may fail, need updating
- **test/client**: ⚠️ **Emptied** - Content moved to examples for better organization
- **test/unit**: ✅ **FULLY WORKING** - 324/324 tests passing, all issues resolved

#### **Known Issues**
1. **Test Timeouts**: Many example tests are timing out (5s-15s), indicating worker thread communication issues
2. **Worker Connection Closures**: "Connection closed" errors in MessagePortReadable during stream processing  
3. **Traditional Build Transformer**: Transformer plugin not being applied in traditional builds
4. **Environment Detection**: Some edge cases in environment detection for traditional builds

### 🔮 **Next Steps**

**Priority 1: Fix Worker Thread Communication**
1. **Debug MessagePort connection closures** - Worker threads are disconnecting prematurely
2. **Fix test timeouts** - Many tests timing out indicating stream/worker issues
3. **Improve worker lifecycle management** - Better cleanup and error handling

**Priority 2: Test Infrastructure** 
4. **Update test/server legacy tests**
5. **Stabilize test/examples suite** - Currently only 17/30 tests passing

**Priority 3: Build System**
7. **Complete transformer plugin integration for traditional builds**
8. **Improve environment detection robustness**

## Worker Thread Communication

The plugin uses a sophisticated worker thread architecture for processing React Server Components and HTML generation. This system enables efficient parallel processing while maintaining clean separation of concerns.

### Two-Port Communication Architecture

The core innovation is the **two-port communication pattern** that separates data flow from control messages:

```typescript
// Create two separate MessagePorts for clean separation
const { port1: dataPort1, port2: dataPort2 } = new MessageChannel();
const { port1: controlPort1, port2: controlPort2 } = new MessageChannel();
```

#### **Data Port** - Stream Data Only
- **Purpose**: Raw RSC/HTML stream data transfer
- **Direction**: Worker → Main Thread
- **Content**: Binary chunks, stream end signals
- **Implementation**: `MessagePortWritable` for workers, direct piping on main thread

#### **Control Port** - Control Messages Only
- **Purpose**: Coordination, metrics, errors, lifecycle events
- **Direction**: Bidirectional
- **Content**: Error messages, metrics data, stream status, HMR events
- **Implementation**: Direct message posting with structured message types

### Worker Communication Patterns

#### **RSC Worker Communication**
```typescript
// In RSC Worker (plugin/worker/rsc/)
const messagePortWritable = new MessagePortWritable(dataPort2);
renderToPipeableStream(element).pipe(messagePortWritable);

// Control messages sent via controlPort2
controlPort2.postMessage({
  type: "RSC_METRICS",
  id: streamId,
  metrics: performanceData
});
```

#### **HTML Worker Communication**
```typescript
// In HTML Worker (plugin/worker/html/)
// Receives RSC data via dataPort, processes to HTML
dataPort.onmessage = (event) => {
  if (event.data === null) {
    rscStream.end(); // End of RSC stream
  } else {
    rscStream.write(event.data); // RSC chunk
  }
};

// Sends HTML data back via same dataPort
dataPort.postMessage(htmlChunk);
```

### File Writing Coordination

The main thread coordinates file writing from multiple worker streams:

1. **RSC Worker** generates RSC streams → Main thread writes `.rsc` files
2. **HTML Worker** processes RSC streams → Main thread writes `.html` files
3. **Stream Synchronization** ensures proper timing and completion
4. **Error Handling** propagates errors through control ports

### Stream Processing Classes

#### **MessagePortWritable**
- Converts Node.js writable streams to MessagePort communication
- Handles backpressure through drain signals
- Used by workers to send stream data to main thread

#### **MessagePortReadable**
- Converts MessagePort communication back to Node.js readable streams  
- Enables standard Node.js stream processing on main thread
- Used for receiving worker stream data

### Performance Benefits

- **Parallel Processing**: RSC and HTML generation happen simultaneously
- **Stream-based**: Memory-efficient streaming instead of buffering
- **Worker Isolation**: Crashes in workers don't affect main thread
- **Clean Architecture**: Separation of data and control concerns

## Traditional Build Compatibility

The plugin supports both the new Vite 6 Environment API and traditional multi-step builds. This section documents the implementation details and lessons learned.

### Build Patterns

**Environment API (New)**: Single `vite build --app` command that builds all environments in parallel
**Traditional (Legacy)**: Multiple separate `vite build` commands for each environment

### Implementation Strategy

#### 1. Environment Plugin Integration

**Key Insight**: Traditional builds need the same configuration logic as environment builds.

**Solution**: Always include the environment plugin in the server plugin, even for traditional builds:

```typescript
const plugins = [
  envPlugin(options),
  // Always include environment plugin to ensure proper rollup configuration
  // This works for both Environment API and traditional builds
  createEnvironmentPlugin(options),
  reactServerPlugin(options),
  // ... other plugins
];
```

**Why This Works**: The environment plugin provides:
- Auto-discovery of files (`resolveAutoDiscover`)
- Proper rollup input configuration (`resolveUserConfig`)
- Environment-specific settings (externals, conditions, etc.)

#### 2. Transformer Plugin for Traditional Builds

**Problem**: Traditional builds don't use the environment plugin's transformer, so we need to add it separately.

**Solution**: Add transformer plugin directly for traditional builds:

```typescript
// For traditional builds, add transformer plugin directly
const isEnvironmentApiMode = process.argv.includes("--app") || process.env['VITE_BUILDER'] != null;
if (!isEnvironmentApiMode) {
  plugins.push(
    createTransformerPlugin({
      name: "server",
      defaultEnvironment: "server",
      allowedEnvironments: ["server"],
    })(options)
  );
}
```

#### 3. Environment Detection

**Problem**: Traditional builds don't have `this.environment` context.

**Solution**: Use `NODE_OPTIONS` to detect server environment:

```typescript
const isServerEnv = this.environment?.name === "server" || 
  (!this.environment && process.env.NODE_OPTIONS?.includes("react-server"));
```

### Current Status

#### ✅ Working
- Build structure generation (`dist/static/`, `dist/client/`, `dist/server/`)
- Auto-discovery and rollup configuration
- Manifest generation
- Component file generation

#### ❌ Still Needs Work
- Transformer plugin not being applied (sourcemap errors show "use client" ignored)
- Client components not being transformed to `registerClientReference`

### Troubleshooting

#### Common Issues

1. **HTML Input Error**: `rollupOptions.input should not be an html file when building for SSR`
   - **Cause**: Vite defaults to `index.html` for SSR builds
   - **Solution**: Use environment plugin to configure proper inputs

2. **Transformer Not Working**: Sourcemap errors about "use client" being ignored
   - **Cause**: Transformer plugin not being invoked during transform phase
   - **Status**: Still investigating plugin order and hook registration

3. **Missing Manifests**: Server build not generating `.vite/manifest.json`
   - **Cause**: Not using environment plugin configuration
   - **Solution**: Always include environment plugin

#### Debugging Tips

1. **Check Plugin Order**: Ensure transformer plugin is early in the chain
2. **Verify Environment Detection**: Check `NODE_OPTIONS` and `this.environment`
3. **Monitor Transform Hooks**: Add debugging to see if transformer is being called
4. **Compare with Environment API**: Traditional builds should produce same output structure

### Future Improvements

1. **Unified Transformer**: Make transformer plugin work for both patterns
2. **Simplified Detection**: Better environment detection for traditional builds
3. **Plugin Order Optimization**: Ensure transformers run at the right time
4. **Error Handling**: Better error messages for traditional build issues

### Testing

Use `npm run test:server -- ./test/examples/build-traditional` to test traditional build compatibility.

**Expected Output Structure**:
```
dist/
├── static/          # Browser build
│   ├── index.html
│   └── index.js
├── client/          # SSR client build
│   ├── .vite/
│   └── components/
└── server/          # Server build
    ├── .vite/
    └── components/
```
