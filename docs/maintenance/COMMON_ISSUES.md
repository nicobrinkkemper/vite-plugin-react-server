# Common Issues & Solutions

This document covers frequently encountered problems, their root causes, and proven solutions in the `vite-plugin-react-server` project.

## 🚨 Critical Issues

### 1. Environment API Build Failures

**Problem**: Build fails with Environment API configuration errors.

**Symptoms**:
- `TypeError: builder.buildApp is not a function`
- `Error: Environment API not supported`
- Build only generates one environment

**Root Cause**: Incorrect Environment API usage or Vite version incompatibility.

**Solution**:
```typescript
// ❌ Wrong - Don't use build() function
await build({
  builder: {
    buildApp: async (builder) => { /* ignored */ },
  },
  environments: { /* ... */ },
});

// ✅ Correct - Use createBuilder()
const builder = await createBuilder({
  plugins: [vitePluginReactServer(options)],
  environments: {
    client: { build: { ssr: false, outDir: "dist/client" } },
    server: { build: { ssr: true, outDir: "dist/server" } },
  },
});

await builder.buildApp(); // Call the method, don't provide a function
```

**Prevention**: Always use `createBuilder()` for Environment API builds.

### 1.1. React Module Externalization Failures

**Problem**: React modules are bundled instead of externalized, causing build and runtime errors.

**Symptoms**:
- `RollupError: "__require" is not exported by "../../../../node_modules/react/index.js"`
- React components fail to render in production
- Bundle size unexpectedly large due to React being included
- Module format conflicts (CommonJS vs ESM)

**Root Cause**: Missing or incorrectly configured `externalConditions` in Vite Environment API.

**Common Mistakes**:
```typescript
// ❌ Wrong - externalConditions is not a Rollup option
rollupOptions: {
  external: ["react", "react-dom"],
  externalConditions: ["react-client"], // This doesn't work
}

// ❌ Wrong - BuildEnvironmentOptions doesn't support resolve
const buildConfig: BuildEnvironmentOptions = {
  resolve: { // This property doesn't exist
    externalConditions: ["react-client"],
  },
}
```

**Solution**:
```typescript
// ✅ Correct - Configure at environment level
environments[envName] = {
  consumer: isServer ? 'server' : 'client',
  
  // CRITICAL: externalConditions belongs in resolve at environment level
  resolve: {
    externalConditions: condition === 'react-client' ? ['react-client'] : ['react-server'],
  },
  
  build: {
    rollupOptions: {
      external: ["react", "react-dom"], // This only controls what's external
      // externalConditions does NOT go here
    },
  },
};
```

**How It Works**:
1. Vite uses `externalConditions` during module resolution
2. React packages have conditional exports based on these conditions
3. Proper conditions ensure correct module variants are loaded
4. Externalization happens when conditions match package exports

**Debugging Steps**:
1. Check if React appears in bundle (should not)
2. Verify `externalConditions` is in `environment.resolve`, not `build.rollupOptions`
3. Confirm conditions match React package's conditional exports
4. Test with both development and production builds

**Prevention**: 
- Always configure `externalConditions` at environment level
- Read Vite TypeScript types to understand configuration structure
- Test React externalization in CI/CD pipelines

### 2. Client Component Transformation Errors

**Problem**: Client components not properly transformed for RSC.

**Symptoms**:
- `Error: export default not found`
- Client components not rendering in RSC
- Build fails with transformation errors

**Root Cause**: Incorrect transformation of `export default` to `export const default`.

**Solution**:
```typescript
// ❌ Wrong transformation
export const default = function MyComponent() { /* ... */ };

// ✅ Correct transformation
export const default = function MyComponent() { /* ... */ };
// or
export { MyComponent as default };
```

**Prevention**: Ensure transformer plugin correctly handles client component exports.

### 3. Worker Loader Path Issues

**Problem**: Worker loader cannot find or load modules.

**Symptoms**:
- `Error: Cannot find module`
- Worker process crashes
- Build hangs on worker initialization

**Root Cause**: Incorrect project root or module path resolution.

**Solution**:
```typescript
// Ensure projectRoot is absolute and correct
const options = {
  projectRoot: path.resolve('/absolute/path/to/project'),
  // ... other options
};

// Verify worker loader configuration
const workerLoader = new WorkerLoader({
  projectRoot: options.projectRoot,
  moduleResolution: 'node',
});
```

**Prevention**: Always use absolute paths for `projectRoot` and verify module resolution.

## ⚠️ Build Issues

### 4. Static Generation Hangs

**Problem**: Build process hangs during static generation.

**Symptoms**:
- Build never completes
- No error messages
- High memory usage

**Root Cause**: Stream processing issues or worker communication problems.

**Solution**:
```typescript
// Add timeout and error handling
const events = await doBuild({
  projectRoot: '/path/to/project',
  timeout: 30000, // 30 second timeout
  onEvent: (event) => {
    if (event.type === 'error') {
      console.error('Build error:', event.data);
      process.exit(1);
    }
  },
});

// Check for specific page issues
const events = await doBuild({
  projectRoot: '/path/to/project',
  pages: ['/'], // Start with single page
  verbose: true,
});
```

**Prevention**: Start with minimal page set and add verbose logging.

### 5. RSC Stream Processing Errors

**Problem**: RSC streams fail to process or generate incorrect content.

**Symptoms**:
- Empty RSC files
- RSC content missing HTML wrapper
- Stream processing timeouts

**Root Cause**: Stream destruction before processing or incorrect stream handling.

**Solution**:
```typescript
// Ensure proper stream handling
const rscStream = await rscWorker.render(page);
const chunks: Uint8Array[] = [];

const reader = rscStream.getReader();
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
} finally {
  reader.releaseLock();
}

const rscContent = Buffer.concat(chunks);
```

**Prevention**: Always use proper stream reading patterns with error handling.

### 6. HTML Generation Failures

**Problem**: HTML files are empty or contain incorrect content.

**Symptoms**:
- HTML files with 0 bytes
- Missing CSS or scripts in HTML
- HTML structure errors

**Root Cause**: RSC-to-HTML conversion issues or timing problems.

**Solution**:
```typescript
// Ensure proper RSC-to-HTML conversion
const htmlWorker = new HTMLWorker({
  projectRoot: options.projectRoot,
});

const htmlContent = await htmlWorker.generateHTML(rscStream);
if (!htmlContent || htmlContent.length === 0) {
  throw new Error('HTML generation failed - empty content');
}
```

**Prevention**: Validate HTML content before writing files.

## 🔧 Development Issues

### 7. Client Dev Server Errors

**Problem**: Client development server fails to start or serve pages.

**Symptoms**:
- `Error: Cannot start dev server`
- Pages not loading in browser
- API routes not working

**Root Cause**: Incorrect middleware setup or port conflicts.

**Solution**:
```typescript
// Ensure proper dev server configuration
const devServer = createDevServer({
  projectRoot: '/path/to/project',
  port: 3000,
  host: 'localhost',
  onError: (error) => {
    console.error('Dev server error:', error);
  },
});

// Check for port conflicts
const server = await devServer.start();
console.log(`Dev server running on ${server.config.server.port}`);
```

**Prevention**: Use unique ports and proper error handling.

### 8. CSS Module Issues

**Problem**: CSS modules not working or styles not applied.

**Symptoms**:
- Styles not loading
- CSS class names not transformed
- CSS not inlined in HTML

**Root Cause**: CSS loader not properly configured or CSS extraction issues.

**Solution**:
```typescript
// Ensure CSS plugin is configured
const plugin = vitePluginReactServer({
  css: {
    modules: true,
    inline: true,
  },
});

// Verify CSS extraction
const cssPlugin = createCSSPlugin({
  modules: true,
  inline: true,
});
```

**Prevention**: Always test CSS functionality in both environments.

### 9. Test Environment Issues

**Problem**: Tests fail in different environments or conditions.

**Symptoms**:
- Tests pass in one environment but fail in another
- React condition conflicts
- Test setup errors

**Root Cause**: Environment-specific test configuration or React condition issues.

**Solution**:
```typescript
// Ensure proper test configuration
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.*'],
    exclude: [
      // Exclude server tests when not in react-server condition
      ...(getCondition() !== 'react-server' ? ['test/server/**/*.test.*'] : []),
    ],
  },
});
```

**Prevention**: Use environment-aware test configuration and proper condition handling.

## 🐛 Debugging Issues

### 10. Memory Leaks

**Problem**: Memory usage grows over time during builds.

**Symptoms**:
- Increasing memory usage
- Build slowdown over time
- Out of memory errors

**Root Cause**: Improper cleanup of workers, streams, or cached data.

**Solution**:
```typescript
// Implement proper cleanup
class BuildManager {
  private workers: Set<Worker> = new Set();
  
  async cleanup() {
    for (const worker of this.workers) {
      await worker.terminate();
    }
    this.workers.clear();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
}

// Use in build process
const buildManager = new BuildManager();
try {
  await doBuild(options);
} finally {
  await buildManager.cleanup();
}
```

**Prevention**: Always implement proper cleanup and monitor memory usage.

### 11. Performance Degradation

**Problem**: Build performance decreases over time or with more pages.

**Symptoms**:
- Build times increase
- Memory usage grows
- Worker startup slows down

**Root Cause**: Lack of caching, inefficient algorithms, or resource leaks.

**Solution**:
```typescript
// Implement caching
const cache = new Map<string, BuildResult>();

async function buildWithCache(page: string): Promise<BuildResult> {
  const cacheKey = generateCacheKey(page);
  
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }
  
  const result = await buildPage(page);
  cache.set(cacheKey, result);
  return result;
}

// Implement worker pooling
const workerPool = new WorkerPool({
  maxWorkers: 4,
  reuseWorkers: true,
});
```

**Prevention**: Implement caching, worker pooling, and performance monitoring.

## 🔍 Diagnostic Tools

### Debug Logging

Enable comprehensive debug logging:

```typescript
const events = await doBuild({
  projectRoot: '/path/to/project',
  verbose: true,
  debug: true,
  onEvent: (event) => {
    console.log(`[${event.type}]`, event.data);
  },
});
```

### Memory Monitoring

Monitor memory usage during builds:

```typescript
const memoryUsage = process.memoryUsage();
console.log('Memory usage:', {
  heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
  heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
  external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
});
```

### Performance Profiling

Use Node.js profiling tools:

```bash
# Run with profiling
node --inspect --expose-gc your-build-script.js

# Generate CPU profile
node --prof your-build-script.js

# Analyze profile
node --prof-process isolate-*.log > profile.txt
```

## 📋 Issue Checklist

When encountering issues, check this checklist:

- [ ] **Environment**: Is the correct React condition set?
- [ ] **Paths**: Are all paths absolute and correct?
- [ ] **Dependencies**: Are all dependencies installed and compatible?
- [ ] **Configuration**: Is the plugin configuration correct?
- [ ] **Logs**: Are there any error messages in the logs?
- [ ] **Memory**: Is memory usage reasonable?
- [ ] **Workers**: Are workers starting and communicating properly?
- [ ] **Streams**: Are streams being processed correctly?
- [ ] **Files**: Are output files being generated?
- [ ] **Tests**: Do tests pass in isolation?

## 🔗 Related Documentation

- [Debugging Guide](./DEBUGGING.md) - Advanced debugging techniques
- [Error Handling](./ERROR_HANDLING.md) - Error handling patterns
- [Testing Guide](./TESTING.md) - Test troubleshooting
- [Performance Monitoring](./PERFORMANCE.md) - Performance issue diagnosis

---

*This documentation covers common issues and their solutions. For specific issues not covered here, refer to the debugging guides or create a new issue in the project repository.*

```typescript
const events = await doBuild({
  projectRoot: '/path/to/project',
  verbose: true,
  debug: true,
  onEvent: (event) => {
    console.log(`[${event.type}]`, event.data);
  },
});
```

### Memory Monitoring

Monitor memory usage during builds:

```typescript
const memoryUsage = process.memoryUsage();
console.log('Memory usage:', {
  heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
  heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
  external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
});
```

### Performance Profiling

Use Node.js profiling tools:

```bash
# Run with profiling
node --inspect --expose-gc your-build-script.js

# Generate CPU profile
node --prof your-build-script.js

# Analyze profile
node --prof-process isolate-*.log > profile.txt
```

## 📋 Issue Checklist

When encountering issues, check this checklist:

- [ ] **Environment**: Is the correct React condition set?
- [ ] **Paths**: Are all paths absolute and correct?
- [ ] **Dependencies**: Are all dependencies installed and compatible?
- [ ] **Configuration**: Is the plugin configuration correct?
- [ ] **Logs**: Are there any error messages in the logs?
- [ ] **Memory**: Is memory usage reasonable?
- [ ] **Workers**: Are workers starting and communicating properly?
- [ ] **Streams**: Are streams being processed correctly?
- [ ] **Files**: Are output files being generated?
- [ ] **Tests**: Do tests pass in isolation?

## 🔗 Related Documentation

- [Debugging Guide](./DEBUGGING.md) - Advanced debugging techniques
- [Error Handling](./ERROR_HANDLING.md) - Error handling patterns
- [Testing Guide](./TESTING.md) - Test troubleshooting
- [Performance Monitoring](./PERFORMANCE.md) - Performance issue diagnosis

---

*This documentation covers common issues and their solutions. For specific issues not covered here, refer to the debugging guides or create a new issue in the project repository.*
