# MessagePort Usage Analysis

## What Gets Created for a Single Page Load

### 1. Worker Startup (Once, when dev server starts)
- **parentPort**: 1 port (20 listeners) - handles all messages to the worker
- **reactLoaderChannel**: 2 ports (15 listeners each) - for loading React components
- **cssLoaderChannel**: 2 ports (15 listeners each) - for loading CSS files  
- **envLoaderChannel**: 2 ports (15 listeners each) - for loading environment variables
- **Total**: 7 ports created once

### 2. HMR Channel (Once, when dev server starts)
- **hmrChannel**: 2 ports (20 listeners each) - for hot module replacement
- **Total**: 2 ports created once

### 3. Per Request (EVERY page load)
- **createMessageChannels()**: Creates 2 channels = 4 ports (15 listeners each)
  - `dataChannel`: For streaming RSC data
  - `controlChannel`: For control messages (end, error, metrics)
- **Total**: 4 ports created per request

## The Problem

For a single page load, you get:
- **9 ports** created at startup (7 worker + 2 HMR)
- **4 ports** created per request
- **Total listeners**: ~110+ listeners just for infrastructure

## Potential Optimizations

1. **Loader channels might not all be needed**: 
   - In dev mode with Vite, CSS and env might be handled by Vite's dev server
   - We could lazy-load these channels only when needed

2. **Per-request channels should be cleaned up**:
   - Currently `createMessageChannels()` creates 4 ports per request
   - These should be closed after the request completes
   - If not cleaned up, they accumulate and cause the listener warnings

3. **Could we reuse channels?**:
   - The data/control channels are per-request because each request needs its own stream
   - But we could potentially pool them or reuse them more efficiently

## Questions to Investigate

1. Are all 3 loader channels actually used for a simple page load?
2. Are the per-request channels being properly closed after use?
3. Could we reduce the number of listeners needed per port?

