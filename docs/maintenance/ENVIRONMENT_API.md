# Vite Environment API Implementation Guide

## Key Insight: Use `createBuilder`, Not `build`

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
