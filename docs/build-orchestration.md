# Build Orchestration

## Overview

The Vite React Server Plugin provides build system support for React Server Components (RSC) and static HTML page generation. This document describes the build process and component interactions.

## Build Architecture

The plugin consists of two main components:

1. **Client Plugin** (`vite-plugin-react-server/client`)
   - Bundles static & client boundary ESM modules
   - Executes without the react-server condition
   - Manages the `rsc-worker` process

2. **Server Plugin** (`vite-plugin-react-server/server`)
   - Bundles server boundary ESM modules
   - Executes with the react-server condition enabled
   - Handles RSC execution in the main thread

Main entry is simply:
```tsx
import { getCondition } from './config/getCondition.js';

export const { vitePluginReactServer } = await import(`./plugin.${getCondition('')}.js`);
```

This is imports the whole suite of plugins that are relevant for each condition, not just /client or /server.


## Build Process

The build process executes in the following sequence:

1. **Static Build** (`vite build`)
   - Generates client-side ESM files in `dist/static`
   - Creates static manifest
   - Processes CSS modules
   - Outputs browser-optimized code

2. **Client boundary Build** (`vite build --ssr`)
   - Generates client-boundary ssr files in `dist/client`
   - Same as the static, but with bare specifier imports intended for ssr.
   - Outputs Node.js-optimized code
   - Uses the same hashes as static build for consistency

3. **Server Build** (`NODE_OPTIONS="--conditions=react-server" vite build`)
   - Resolves assets using client manifest
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
    pages: ["/", "/about"],  // Routes to generate
    dir: "dist",             // Base output directory
    client: "client",        // Client assets directory
    server: "server",        // Server assets directory
    static: "static",        // Static output directory
    hash: "hash",           // Client file hashing
    preserveModulesRoot: true // Module path preservation
  }
} satisfies StreamPluginOptions;
```

## Build Requirements

First `vite build`, then `vite build --ssr` and then `NODE_OPTIONS="--conditions=react-server" vite build`