# Vite Environment API Implementation Guide

## Migration Guide: Vite 5 → Vite 6 Environment API

When upgrading from Vite 5 to Vite 6, several APIs have been moved from the `ViteDevServer` to environment-specific instances. Here's a quick reference for the most common changes:

### API Migrations

| **Vite 5 (Old)** | **Vite 6 (New)** |
|-------------------|------------------|
| `server.moduleGraph` | `environment.moduleGraph` |
| `server.reloadModule(module)` | `environment.reloadModule(module)` |
| `server.pluginContainer` | `environment.pluginContainer` |
| `server.transformRequest(url, ssr)` | `environment.transformRequest(url)` |
| `server.warmupRequest(url, ssr)` | `environment.warmupRequest(url)` |
| `server.hot` | `server.client.environment.hot` |

### Migration Examples

#### Before (Vite 5):
```typescript
// Accessing module graph
const moduleGraph = server.moduleGraph;

// Transform request with SSR flag
const result = await server.transformRequest('/src/component.tsx', true);

// Reload a module
await server.reloadModule(module);
```

#### After (Vite 6):
```typescript
// Access environment-specific module graph
const serverModuleGraph = server.environments.ssr.moduleGraph;
const clientModuleGraph = server.environments.client.moduleGraph;

// Transform request (environment determines SSR behavior)
const result = await server.environments.ssr.transformRequest('/src/component.tsx');

// Reload module in specific environment
await server.environments.ssr.reloadModule(module);
```

### Plugin Hook Changes

#### Before (Vite 5):
```typescript
export function myPlugin() {
  return {
    name: 'my-plugin',
    transform(code, id) {
      // This.ssr indicates SSR context
      if (this.ssr) {
        // Server-side transform
      } else {
        // Client-side transform
      }
    }
  };
}
```

#### After (Vite 6):
```typescript
export function myPlugin() {
  return {
    name: 'my-plugin',
    transform(code, id) {
      // Use this.environment to determine context
      if (this.environment.name === 'ssr') {
        // Server-side transform
      } else if (this.environment.name === 'client') {
        // Client-side transform
      }
    }
  };
}
```

### ⚠️ Critical Issue: Node.js Conditions Inheritance

**One of the most important migration issues** is that Vite 6 Environment API **does not properly inherit Node.js execution context** (`process.execArgv`) from the main thread to build environments.

#### The Problem
When running with Node.js conditions:
```bash
NODE_OPTIONS='--conditions react-server' node --conditions react-server ./node_modules/.bin/vitest run
```

**Expected**: All environments should have `--conditions react-server` in `process.execArgv`  
**Actual**: Build environments get `--conditions node --conditions development` (missing `react-server`)

This causes React Server DOM conditional exports to resolve incorrectly, leading to:
```
Error: The React Server Writer cannot be used outside a react-server environment.
```

#### Workarounds

1. **Vitest Configuration** (partial fix):
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    poolOptions: {
      forks: {
        execArgv: getCondition() === "react-server" 
          ? ["--conditions", "react-server", "--conditions", "node", "--conditions", "development"]
          : ["--conditions", "node", "--conditions", "development"],
      },
    },
  },
});
```

2. **Environment Resolve Configuration**:
```typescript
// In environment config
environments[envConfig.name] = {
  resolve: {
    conditions: envConfig.condition === 'react-server' 
      ? ['react-server', 'node', 'development'] 
      : ['node', 'development'],
    externalConditions: envConfig.condition === 'react-client' 
      ? ['react-client'] 
      : ['react-server'],
  },
};
```

#### Status
This is a **known limitation** of Vite 6 Environment API that requires framework-level fixes. Track progress in:
- [Vitest Issue #7070](https://github.com/vitest-dev/vitest/issues/7070)
- Vite Environment API discussions

### Key Insight: Use `createBuilder`, Not `build`

The Environment API requires using `createBuilder` to get a `ViteBuilder` instance, then manually calling `builder.buildApp()` to build all environments.

### ❌ Wrong Approach (What AI Initially Tried)
```typescript
// This does NOT work for Environment API
await build({
  builder: {
    buildApp: async (builder) => {  // ❌ This is ignored!
      // Custom buildApp function is not used
    },
  },
  environments: { /* ... */ },
});
```

### ✅ Correct Approach (What Actually Works)
```typescript
import { createBuilder } from "vite";

// Create the ViteBuilder instance
const builder = await createBuilder({
  plugins: vitePluginReactServer(options),
  mode: "test",
  root: options.projectRoot,
  builder: {
    sharedConfigBuild: false,
    sharedPlugins: false,
  },
  environments: {
    client: {
      build: {
        ssr: false,
        outDir: "dist/client",
      },
    },
    server: {
      build: {
        ssr: true,
        outDir: "dist/server",
      },
    },
  },
});

// Manually call buildApp() to build all environments
console.log("🔍 Environment API: Starting app build with environments:", Object.keys(builder.environments));
await builder.buildApp();
```

## Key TypeScript Types

### ViteBuilder Interface
```typescript
interface ViteBuilder {
  environments: Record<string, BuildEnvironment>;
  config: ResolvedConfig;
  buildApp(): Promise<void>;  // This is the method that builds all environments
  build(environment: BuildEnvironment): Promise<RollupOutput | RollupOutput[] | RollupWatcher>;
}
```

### BuildEnvironment Class
```typescript
declare class BuildEnvironment extends BaseEnvironment {
  mode: "build";
  constructor(name: string, config: ResolvedConfig, setup?: {
    options?: EnvironmentOptions;
  });
  init(): Promise<void>;
}
```

### createBuilder Function
```typescript
declare function createBuilder(inlineConfig?: InlineConfig, useLegacyBuilder?: null | boolean): Promise<ViteBuilder>;
```

## Important Notes

1. **`buildApp()` is a method on ViteBuilder, not a function you provide**
   - The `buildApp` property in the builder config is ignored
   - Vite has its own `buildApp()` method that handles all environments

2. **Environment API is experimental**
   - Requires `@experimental` features to be enabled
   - May not work in all Vite versions

3. **All environments must be explicitly configured**
   - Both `client` and `server` environments need to be defined
   - Each environment can have its own `outDir` and `ssr` settings

4. **Plugins must use `applyToEnvironment` correctly**
   - Client plugins should apply to "client" environment
   - Server plugins should apply to "server" environment

## Performance Characteristics

### Environment Performance Comparison

The plugin supports two React environments with different static generation performance characteristics:

#### **Server Environment** (`--conditions react-server`)
- **RSC Operations**: Optimized for React Server Components
- **Worker Type**: HTML worker with separate process
- **Cold Start**: ~116ms worker startup
- **Warm Performance**: 1-30ms per route
- **Best For**: RSC-heavy applications, server-side rendering

#### **Client Environment** (Regular React)
- **RSC Operations**: Client-side RSC simulation
- **Worker Type**: RSC worker with React Server Components
- **Cold Start**: ~349ms worker startup
- **Warm Performance**: 5-26ms per route
- **Best For**: Client-side applications, development workflows

### Performance Metrics (Warm Worker)

| Operation | Server Environment | Client Environment | Difference |
|-----------|-------------------|-------------------|------------|
| **RSC headless** | 0.74ms | 5.38ms | Server 7.3x faster |
| **HTML generation** | 5.03ms | 4.99ms | Nearly identical |
| **RSC full** | 2.94ms | 6.96ms | Server 2.4x faster |
| **Module resolution** | 0.12ms | 1.23ms | Server 10x faster |

### Key Performance Insights

1. **Worker Overhead**: First route includes worker startup (116-349ms), subsequent routes are much faster
2. **RSC Performance**: Server environment is significantly faster for RSC operations
3. **HTML Generation**: Both environments perform similarly for HTML generation
4. **Real-World Impact**: For small sites, both environments are near-instant after warm-up

### Recommendations

- **Small Sites**: Either environment works well, performance difference is negligible
- **RSC-Heavy Apps**: Prefer server environment for better RSC performance
- **Development**: Client environment provides better control over the complete nodejs environment
- **Production**: Server environment offers better overall performance for RSC operations


## Resources

- [Vite Environment API Documentation](https://vite.dev/guide/api-environment.html#environment-api)
- [Vite Environment Examples](https://github.com/hi-ogawa/vite-environment-examples)
- [Vite Types](https://github.com/vitejs/vite/blob/main/packages/vite/types/index.d.ts)

## Debugging Tips

1. **Check if `builder.buildApp()` is being called**
   - Add console.log to see if the method executes
   - Look for "🔍 Environment API: Starting app build with environments:" log

2. **Verify all environments are configured**
   - Ensure both `client` and `server` are in the `environments` config
   - Check that `outDir` paths are correct

3. **Confirm plugins are applying to correct environments**
   - Use `applyToEnvironment` to filter plugins per environment
   - Check that SSR settings match the environment type

## Common Mistakes

1. **Using `build()` instead of `createBuilder()`**
   - The `build` function doesn't support Environment API properly
   - Always use `createBuilder` for multi-environment builds

2. **Providing custom `buildApp` function**
   - This is ignored by Vite
   - Use the built-in `builder.buildApp()` method

3. **Not configuring all environments**
   - Missing `client` or `server` environment config
   - Results in only one environment being built

4. **Incorrect SSR settings**
   - Server environment should have `ssr: true`
   - Client environment should have `ssr: false`

## React Module Externalization Deep Dive

### The Problem: React Modules Being Bundled Instead of Externalized

One of the most complex debugging challenges in the Environment API integration was getting React modules to be properly externalized instead of bundled into the output. This section documents the complete debugging journey and solution.

#### Initial Symptoms
```
RollupError: "__require" is not exported by "../../../../node_modules/react/index.js"
```

This error indicated that React was being bundled as a CommonJS module but being imported as ESM, which fails because of missing exports.

#### Root Cause Analysis

The issue was traced through multiple layers:

1. **Environment-Level Configuration Missing**: React externalization requires proper Node.js conditional exports resolution
2. **Vite vs Rollup Configuration**: `externalConditions` is a Vite-specific option, not a Rollup option
3. **Configuration Location**: Must be set at `environment.resolve` level, not in `build.rollupOptions`

#### Failed Attempts and Learnings

##### ❌ Attempt 1: Adding to Rollup Options
```typescript
// This DOES NOT work - externalConditions is not a Rollup option
rollupOptions: {
  external: ["react", "react-dom"],
  externalConditions: ["react-client"], // ❌ Wrong place, wrong API
}
```

**Learning**: `externalConditions` is not part of Rollup's `InputOptions` interface.

##### ❌ Attempt 2: Adding to BuildEnvironmentOptions
```typescript
// This DOES NOT work - BuildEnvironmentOptions doesn't support resolve
const clientConfig: BuildEnvironmentOptions = {
  resolve: { // ❌ Not supported at this level
    externalConditions: ["react-client"],
  },
  // ...
}
```

**Learning**: `BuildEnvironmentOptions` only supports build-specific options, not resolve options.

#### ✅ Correct Solution: Environment-Level Configuration

The solution is to configure `externalConditions` at the environment level in the `EnvironmentOptions`:

```typescript
// In createEnvironmentPlugin.ts
environments[envConfig.name] = {
  consumer: envConfig.name === 'server' || envConfig.name === 'ssr' ? 'server' : 'client',
  
  // CRITICAL: This is where externalConditions belongs
  resolve: {
    externalConditions: envConfig.condition === 'react-client' ? ['react-client'] : ['react-server'],
  },
  
  build: {
    // Build options without resolve config
    rollupOptions: mappedRollupOptions,
  },
};
```

#### How It Works

1. **Vite Environment API**: Each environment gets its own resolve configuration
2. **Node.js Conditional Exports**: React packages use conditional exports to provide different entry points
3. **Module Resolution**: Vite uses `externalConditions` during module resolution to determine which variant to load
4. **Externalization**: When conditions match, modules are externalized instead of bundled

#### Example: React Server DOM Resolution

React Server DOM's `package.json` has conditional exports:
```json
{
  "exports": {
    "./server": {
      "react-server": "./server.node.js",  // ← Used when react-server condition is set
      "default": "./server.js"             // ← Used otherwise
    }
  }
}
```

With proper `externalConditions`, Vite knows:
- In `react-server` environment: Use `server.node.js`
- In `react-client` environment: Use `server.js`

#### TypeScript Type Hierarchy

Understanding the type relationships helped solve this:

```typescript
// Vite's environment configuration hierarchy
interface EnvironmentOptions extends SharedEnvironmentOptions {
  resolve?: EnvironmentResolveOptions;  // ← externalConditions goes here
  build?: BuildEnvironmentOptions;      // ← NOT here
}

interface EnvironmentResolveOptions {
  externalConditions?: string[];        // ← This is the key option
  conditions?: string[];
  mainFields?: string[];
}
```

#### Debugging Process Summary

1. **Identify symptoms**: React bundling errors
2. **Check Rollup external config**: Confirmed React was in external list
3. **Investigate conditional exports**: Found React Server DOM uses conditions
4. **Research Vite types**: Discovered `externalConditions` is Vite-specific
5. **Find correct location**: Environment-level resolve configuration
6. **Implement solution**: Add `resolve.externalConditions` to each environment
7. **Verify fix**: All tests pass with proper externalization

#### Key Takeaways

1. **Vite !== Rollup**: Don't assume Rollup options work in Vite configuration
2. **Read the Types**: TypeScript interfaces reveal the correct configuration structure
3. **Environment-Level Thinking**: Modern Vite uses environment-specific configurations
4. **Conditional Exports Matter**: React ecosystem heavily relies on Node.js conditional exports
5. **Test Thoroughly**: React externalization affects both build and runtime behavior

#### Prevention

To prevent similar issues in the future:

1. **Always check Vite types** before assuming configuration locations
2. **Test with realistic React imports** to catch externalization issues early
3. **Document environment-specific configurations** clearly
4. **Use TypeScript** to catch configuration structure errors
5. **Monitor build outputs** to ensure externalization is working

This debugging process took significant time because it required understanding the intersection of:
- Vite Environment API
- Rollup configuration
- Node.js conditional exports
- React Server Components architecture
- TypeScript type definitions

The final solution is simple, but getting there required deep investigation across multiple layers of the build system.


// Manually call buildApp() to build all environments
console.log("🔍 Environment API: Starting app build with environments:", Object.keys(builder.environments));
await builder.buildApp();
```

## Key TypeScript Types

### ViteBuilder Interface
```typescript
interface ViteBuilder {
  environments: Record<string, BuildEnvironment>;
  config: ResolvedConfig;
  buildApp(): Promise<void>;  // This is the method that builds all environments
  build(environment: BuildEnvironment): Promise<RollupOutput | RollupOutput[] | RollupWatcher>;
}
```

### BuildEnvironment Class
```typescript
declare class BuildEnvironment extends BaseEnvironment {
  mode: "build";
  constructor(name: string, config: ResolvedConfig, setup?: {
    options?: EnvironmentOptions;
  });
  init(): Promise<void>;
}
```

### createBuilder Function
```typescript
declare function createBuilder(inlineConfig?: InlineConfig, useLegacyBuilder?: null | boolean): Promise<ViteBuilder>;
```

## Important Notes

1. **`buildApp()` is a method on ViteBuilder, not a function you provide**
   - The `buildApp` property in the builder config is ignored
   - Vite has its own `buildApp()` method that handles all environments

2. **Environment API is experimental**
   - Requires `@experimental` features to be enabled
   - May not work in all Vite versions

3. **All environments must be explicitly configured**
   - Both `client` and `server` environments need to be defined
   - Each environment can have its own `outDir` and `ssr` settings

4. **Plugins must use `applyToEnvironment` correctly**
   - Client plugins should apply to "client" environment
   - Server plugins should apply to "server" environment

## Performance Characteristics

### Environment Performance Comparison

The plugin supports two React environments with different static generation performance characteristics:

#### **Server Environment** (`--conditions react-server`)
- **RSC Operations**: Optimized for React Server Components
- **Worker Type**: HTML worker with separate process
- **Cold Start**: ~116ms worker startup
- **Warm Performance**: 1-30ms per route
- **Best For**: RSC-heavy applications, server-side rendering

#### **Client Environment** (Regular React)
- **RSC Operations**: Client-side RSC simulation
- **Worker Type**: RSC worker with React Server Components
- **Cold Start**: ~349ms worker startup
- **Warm Performance**: 5-26ms per route
- **Best For**: Client-side applications, development workflows

### Performance Metrics (Warm Worker)

| Operation | Server Environment | Client Environment | Difference |
|-----------|-------------------|-------------------|------------|
| **RSC headless** | 0.74ms | 5.38ms | Server 7.3x faster |
| **HTML generation** | 5.03ms | 4.99ms | Nearly identical |
| **RSC full** | 2.94ms | 6.96ms | Server 2.4x faster |
| **Module resolution** | 0.12ms | 1.23ms | Server 10x faster |

### Key Performance Insights

1. **Worker Overhead**: First route includes worker startup (116-349ms), subsequent routes are much faster
2. **RSC Performance**: Server environment is significantly faster for RSC operations
3. **HTML Generation**: Both environments perform similarly for HTML generation
4. **Real-World Impact**: For small sites, both environments are near-instant after warm-up

### Recommendations

- **Small Sites**: Either environment works well, performance difference is negligible
- **RSC-Heavy Apps**: Prefer server environment for better RSC performance
- **Development**: Client environment provides better control over the complete nodejs environment
- **Production**: Server environment offers better overall performance for RSC operations


## Resources

- [Vite Environment API Documentation](https://vite.dev/guide/api-environment.html#environment-api)
- [Vite Environment Examples](https://github.com/hi-ogawa/vite-environment-examples)
- [Vite Types](https://github.com/vitejs/vite/blob/main/packages/vite/types/index.d.ts)

## Debugging Tips

1. **Check if `builder.buildApp()` is being called**
   - Add console.log to see if the method executes
   - Look for "🔍 Environment API: Starting app build with environments:" log

2. **Verify all environments are configured**
   - Ensure both `client` and `server` are in the `environments` config
   - Check that `outDir` paths are correct

3. **Confirm plugins are applying to correct environments**
   - Use `applyToEnvironment` to filter plugins per environment
   - Check that SSR settings match the environment type

## Common Mistakes

1. **Using `build()` instead of `createBuilder()`**
   - The `build` function doesn't support Environment API properly
   - Always use `createBuilder` for multi-environment builds

2. **Providing custom `buildApp` function**
   - This is ignored by Vite
   - Use the built-in `builder.buildApp()` method

3. **Not configuring all environments**
   - Missing `client` or `server` environment config
   - Results in only one environment being built

4. **Incorrect SSR settings**
   - Server environment should have `ssr: true`
   - Client environment should have `ssr: false`

## React Module Externalization Deep Dive

### The Problem: React Modules Being Bundled Instead of Externalized

One of the most complex debugging challenges in the Environment API integration was getting React modules to be properly externalized instead of bundled into the output. This section documents the complete debugging journey and solution.

#### Initial Symptoms
```
RollupError: "__require" is not exported by "../../../../node_modules/react/index.js"
```

This error indicated that React was being bundled as a CommonJS module but being imported as ESM, which fails because of missing exports.

#### Root Cause Analysis

The issue was traced through multiple layers:

1. **Environment-Level Configuration Missing**: React externalization requires proper Node.js conditional exports resolution
2. **Vite vs Rollup Configuration**: `externalConditions` is a Vite-specific option, not a Rollup option
3. **Configuration Location**: Must be set at `environment.resolve` level, not in `build.rollupOptions`

#### Failed Attempts and Learnings

##### ❌ Attempt 1: Adding to Rollup Options
```typescript
// This DOES NOT work - externalConditions is not a Rollup option
rollupOptions: {
  external: ["react", "react-dom"],
  externalConditions: ["react-client"], // ❌ Wrong place, wrong API
}
```

**Learning**: `externalConditions` is not part of Rollup's `InputOptions` interface.

##### ❌ Attempt 2: Adding to BuildEnvironmentOptions
```typescript
// This DOES NOT work - BuildEnvironmentOptions doesn't support resolve
const clientConfig: BuildEnvironmentOptions = {
  resolve: { // ❌ Not supported at this level
    externalConditions: ["react-client"],
  },
  // ...
}
```

**Learning**: `BuildEnvironmentOptions` only supports build-specific options, not resolve options.

#### ✅ Correct Solution: Environment-Level Configuration

The solution is to configure `externalConditions` at the environment level in the `EnvironmentOptions`:

```typescript
// In createEnvironmentPlugin.ts
environments[envConfig.name] = {
  consumer: envConfig.name === 'server' || envConfig.name === 'ssr' ? 'server' : 'client',
  
  // CRITICAL: This is where externalConditions belongs
  resolve: {
    externalConditions: envConfig.condition === 'react-client' ? ['react-client'] : ['react-server'],
  },
  
  build: {
    // Build options without resolve config
    rollupOptions: mappedRollupOptions,
  },
};
```

#### How It Works

1. **Vite Environment API**: Each environment gets its own resolve configuration
2. **Node.js Conditional Exports**: React packages use conditional exports to provide different entry points
3. **Module Resolution**: Vite uses `externalConditions` during module resolution to determine which variant to load
4. **Externalization**: When conditions match, modules are externalized instead of bundled

#### Example: React Server DOM Resolution

React Server DOM's `package.json` has conditional exports:
```json
{
  "exports": {
    "./server": {
      "react-server": "./server.node.js",  // ← Used when react-server condition is set
      "default": "./server.js"             // ← Used otherwise
    }
  }
}
```

With proper `externalConditions`, Vite knows:
- In `react-server` environment: Use `server.node.js`
- In `react-client` environment: Use `server.js`

#### TypeScript Type Hierarchy

Understanding the type relationships helped solve this:

```typescript
// Vite's environment configuration hierarchy
interface EnvironmentOptions extends SharedEnvironmentOptions {
  resolve?: EnvironmentResolveOptions;  // ← externalConditions goes here
  build?: BuildEnvironmentOptions;      // ← NOT here
}

interface EnvironmentResolveOptions {
  externalConditions?: string[];        // ← This is the key option
  conditions?: string[];
  mainFields?: string[];
}
```

#### Debugging Process Summary

1. **Identify symptoms**: React bundling errors
2. **Check Rollup external config**: Confirmed React was in external list
3. **Investigate conditional exports**: Found React Server DOM uses conditions
4. **Research Vite types**: Discovered `externalConditions` is Vite-specific
5. **Find correct location**: Environment-level resolve configuration
6. **Implement solution**: Add `resolve.externalConditions` to each environment
7. **Verify fix**: All tests pass with proper externalization

#### Key Takeaways

1. **Vite !== Rollup**: Don't assume Rollup options work in Vite configuration
2. **Read the Types**: TypeScript interfaces reveal the correct configuration structure
3. **Environment-Level Thinking**: Modern Vite uses environment-specific configurations
4. **Conditional Exports Matter**: React ecosystem heavily relies on Node.js conditional exports
5. **Test Thoroughly**: React externalization affects both build and runtime behavior

#### Prevention

To prevent similar issues in the future:

1. **Always check Vite types** before assuming configuration locations
2. **Test with realistic React imports** to catch externalization issues early
3. **Document environment-specific configurations** clearly
4. **Use TypeScript** to catch configuration structure errors
5. **Monitor build outputs** to ensure externalization is working

This debugging process took significant time because it required understanding the intersection of:
- Vite Environment API
- Rollup configuration
- Node.js conditional exports
- React Server Components architecture
- TypeScript type definitions

The final solution is simple, but getting there required deep investigation across multiple layers of the build system.
