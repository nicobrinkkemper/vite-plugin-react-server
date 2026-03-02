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

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->



1.	[Getting Started](./getting-started.md)
2.	[Core Concepts](./core-concepts.md)
3.	[Configuration Guide](./configuration.md)
4.	[CSS & Styling](./css-handling.md)
5.	[Server Actions](./server-actions.md)
6.	[Build & Deployment](./build-orchestration.md)
7.	[Advanced Development](./advanced-topics.md)
8.	[Plugin Internals](./transformer-plugin.md)
9.	[Worker System](./rsc-worker.md)
10.	[API Reference](./api-reference.md)
11.	[React Compatibility](./react-type-compatibility.md)
12.	[Troubleshooting](./troubleshooting-guide.md)
13.	[Package Exports](./package-exports.md)
14.	[Transformations](./transformations.md)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->

