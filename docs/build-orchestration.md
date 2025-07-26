# Build Orchestration
## Overview

The Vite React Server Plugin provides build system support for React Server Components (RSC) and static HTML page generation. This document describes the build process and component interactions.

## Build Architecture

These two plugins contain the dev and preview server implementations

1. **Client Plugin** (`vite-plugin-react-server/client`)

   - Bundles static & client boundary ESM modules
   - Executes without the react-server condition
   - Manages the `rsc-worker` process

2. **Server Plugin** (`vite-plugin-react-server/server`)
   - Bundles server boundary ESM modules
   - Executes with the react-server condition enabled
   - Handles RSC execution in the main thread

This is the "after-burner" plugin for the static build, which requires the react-server condition

3. **Static Plugin** (`vite-plugin-react-server/static`)
   - Serializes all props & pages in build.pages to `dist/static`
   - Outputs onMetric events
   - Outputs onEvent with build information

Then there are the essential utility plugins

4. **Transformer Plugin** (`vite-plugin-react-server/transformer`)

   - Handles `transformModuleIfNeeded` for client/server boundary
   - Maintain hashes with static manifest
   - Determines final module id for components5. **Env plugin** (`vite-plugin-react-server/env`)
   - Loads & Checks the environment on launch
   - Sets and unsets default VITE\_ process variables early (like VITE_BASE_URL and VITE_PUBLIC_ORIGIN)
   - Makes process.env available even in the config step (string only)

Main entry is simply:

```tsx
import { getCondition } from "./config/getCondition.js";

export const { vitePluginReactServer } = await import(
  `./plugin.${getCondition("")}.js`
);
```

This imports all of plugins that are relevant for each condition. For example

```tsx
// plugin.client.ts
import { reactTransformPlugin } from "./transformer/plugin.client.js";
import type { StreamPluginOptions } from "../types.js";
import { reactClientPlugin } from "./react-client/plugin.js";
import { envPlugin } from "./env/plugin.js";

export function vitePluginReactServer(
  options = {} as StreamPluginOptions
): import("vite").Plugin[] {
  return [
    envPlugin(),
    reactClientPlugin(options),
    reactTransformPlugin(options),
  ];
}
```

## Build Process

The build process executes in the following sequence:

1. **Static Build** (`vite build`)

   - Generates client-side ESM files in `dist/static`
   - Creates static manifest
   - Processes CSS modules
   - Outputs browser-optimized code

2. **Client Boundary Build** (`vite build --ssr`)

   - Generates client-boundary ssr files in `dist/client`
   - Same as the static, but with bare specifier imports intended for ssr.
   - Outputs Node.js-optimized code
   - Uses the same hashes as static build for consistency

3. **Server Boundary Build** (`NODE_OPTIONS="--conditions=react-server" vite build`)
   - Generates RSC content
   - Outputs Node.js-optimized code
   - Uses the same hashes as static build for consistency
   - Upgrades `dist/static` directory with fixed index.html/.rsc files

## Build Output Structure

The build generates the following directory structure:

```
dist/
├── static/
    ├── index.html          # Generated HTML
    ├── index.rsc           # Headless RSC content
│   └── .vite/manifest.json # Main manifest
├── client/
│   └── ...                 # React client boundary
├── server/
│   └── ...                 # React server boundary
```

## Environment-Specific Behavior

### Development Mode

- Uses Vite's dev server
- Provides error messages and stack traces
- Enables source maps

### Production Mode

- Optimizes code output
- Minimizes bundle sizes
- Generates static files

## Build Configuration

The build process accepts the following configuration options:

```typescript
export const config = {
  build: {
    pages: ["/", "/about"], // Routes to generate
    dir: "dist", // Base output directory
    client: "client", // Client assets directory
    server: "server", // Server assets directory
    static: "static", // Static output directory
    hash: "hash", // Client file hashing
    preserveModulesRoot: true, // Module path preservation
  },
} satisfies StreamPluginOptions;
```

## Build Requirements

First `vite build`, then `vite build --ssr` and then `NODE_OPTIONS="--conditions=react-server" vite build`

<!-- AUTO-GENERATED-TOC-START -->

## 📚 Documentation Navigation

## Table of Contents

1. [Getting Started](./getting-started.md)
	- [Installation and Setup](./getting-started.md#installation-and-setup)
	- [Basic Configuration](./getting-started.md#basic-configuration)
	- [Example Projects](./getting-started.md#example-projects)

2. [Core Concepts](./core-concepts.md)
	- [Client-Server Separation](./core-concepts.md#client-server-separation)
	- [React Server Components](./core-concepts.md#react-server-components)
	- [Plugin Architecture](./core-concepts.md#plugin-architecture)

3. [Configuration](./configuration.md)
	- [Plugin Options](./configuration.md#plugin-options)
	- [Routing Configuration](./configuration.md#routing-configuration)
	- [Build Configuration](./configuration.md#build-configuration)

4. [Component Resolution](./component-resolution.md)
	- [Path-based vs Direct Components](./component-resolution.md#path-based-vs-direct-components)
	- [When to Use Each Approach](./component-resolution.md#when-to-use-each-approach)
	- [Migration Guide](./component-resolution.md#migration-guide)

5. [CSS Handling](./css-handling.md)
	- [CSS Collectors](./css-handling.md#css-collectors)
	- [Inline CSS](./css-handling.md#inline-css)
	- [Custom CSS Processing](./css-handling.md#custom-css-processing)

6. [Server Actions](./server-actions.md)
	- [Creating Server Actions](./server-actions.md#creating-server-actions)
	- [Client Integration](./server-actions.md#client-integration)
	- [Error Handling](./server-actions.md#error-handling)
	- [Database Integration](./server-actions.md#database-integration)

7. [Static Site Generation](./static-site-generation.md)
	- [Static Plugin](./static-site-generation.md#static-plugin)
	- [Build Process](./static-site-generation.md#build-process)
	- [Deployment Strategies](./static-site-generation.md#deployment-strategies)

8. **[Build Orchestration](./build-orchestration.md) ← you are here**
	- [Multiple Build Targets](./build-orchestration.md#multiple-build-targets)
	- [Plugin Architecture](./build-orchestration.md#plugin-architecture)
	- [Environment-Specific Builds](./build-orchestration.md#environment-specific-builds)

9. [Architecture](./architecture.md)
	- [Design Philosophy](./architecture.md#design-philosophy)
	- [Environment Variables](./architecture.md#environment-variables)
	- [Plugin Composition](./architecture.md#plugin-composition)
	- [HTML Component Support](./architecture.md#html-component-support)

10. [Advanced Topics](./advanced-topics.md)
	- [Custom Workers](./advanced-topics.md#custom-workers)
	- [Message System](./advanced-topics.md#message-system)
	- [Extending the Plugin](./advanced-topics.md#extending-the-plugin)

11. [API Reference](./api-reference.md)
	- [Plugin Options](./api-reference.md#plugin-options)
	- [Component Props](./api-reference.md#component-props)
	- [Worker Messages](./api-reference.md#worker-messages)
	- [Type Definitions](./api-reference.md#type-definitions)

12. [Transformations](./transformations.md)
	 - [Code Transformations](./transformations.md#code-transformations)
	 - [Directive Handling](./transformations.md#directive-handling)
	 - [Build Output Examples](./transformations.md#build-output-examples)

13. [Loader](./loader.md)
	 - [React Server Components Loader](./loader.md#react-server-components-loader)
	 - [Directive Processing](./loader.md#directive-processing)
	 - [Module Boundaries](./loader.md#module-boundaries)
	 - [Custom Registration Functions](./loader.md#custom-registration-functions)

14. [Patch System](./patch-system.md)
	 - [React Version Compatibility](./patch-system.md#react-version-compatibility)
	 - [Creating Patches](./patch-system.md#creating-patches)
	 - [Maintenance Guide](./patch-system.md#maintenance-guide)

15. [Practical Guide](./practical-guide.md)
	 - [Real-world Examples](./practical-guide.md#real-world-examples)
	 - [Debugging Features](./practical-guide.md#debugging-features)
	 - [Production Implementations](./practical-guide.md#production-implementations)

16. [Troubleshooting Guide](./troubleshooting-guide.md)
	 - [Common Issues](./troubleshooting-guide.md#common-issues)
	 - [Debugging Tips](./troubleshooting-guide.md#debugging-tips)
	 - [Performance Optimization](./troubleshooting-guide.md#performance-optimization)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- AUTO-GENERATED-TOC-END -->