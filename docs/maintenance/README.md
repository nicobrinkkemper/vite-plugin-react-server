# Maintenance Guide

This guide covers maintenance tasks, troubleshooting, and development practices for the vite-plugin-react-server project.

## Table of Contents

- [Testing](./TESTING.md) - Testing practices and test infrastructure
- [Traditional Build Compatibility](#traditional-build-compatibility) - Supporting legacy Vite build patterns

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
