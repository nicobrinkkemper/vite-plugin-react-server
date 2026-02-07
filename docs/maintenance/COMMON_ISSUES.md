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
  plugins: vitePluginReactServer(options),
  mode: "test",
  root: options.projectRoot,
});
await builder.buildApp();
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
    externalConditions: condition === 'react-client' ? undefined : ['react-server'],
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
export default function MyComponent() { /* ... */ };
// or
export default MyComponent;
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
const events = await doBuild({
  projectRoot: '/path/to/project',
  onEvent: (event) => {
    if (event.type === 'route.error') {
      console.trace(event.error);
    }
  },
});

// Check for specific page issues
const events = await doBuild({
  pages: ['/'], // Start with single page
  Page: 'src/page.tsx',
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
import { createRscStream } from "vite-plugin-react-server/stream";
import { createHandlerOptions } from "vite-plugin-react-server/config";
import { Writable } from "node:stream";

// assuming the plugin is included in vite.config.ts

const config = await createHandlerOptions("/", {
  configEnv: { command: "serve", mode: "development" }
});

const rscStreamResult = createRscStream(config);
const chunks: Buffer[] = [];

// Concise approach using Writable stream
await new Promise<void>((resolve, reject) => {
  const writable = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk);
      callback();
    }
  });

  writable.on("finish", resolve);
  writable.on("error", reject);

  rscStreamResult.rscStream.pipe(writable);
});

const rscContent = Buffer.concat(chunks);

console.log({rscContent})
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

### 7. Performance Script Inconsistency

**Problem**: HTML output includes unexpected performance script (`requestAnimationFrame(function(){$RT=performance.now()});`) in some environments but not others.

**Symptoms**:
- Server environment generates HTML with performance script
- Client environment generates HTML without performance script
- Inconsistent HTML output between environments for same content
- Performance script appears: `<script>requestAnimationFrame(function(){$RT=performance.now()});</script>`

**Root Cause**: HTML worker calling `pipe()` at a later point in time instead of immediately after getting the `pipe` function, triggering React's suspense timing mechanism.

**Solution**:
```typescript
// ❌ Wrong - Triggers performance script
const { pipe } = ReactDOMServer.renderToPipeableStream(result.children, {
  onShellReady() {
    pipe(passThrough); // Called later inside callback
  },
});

// ✅ Correct - No performance script
const { pipe } = ReactDOMServer.renderToPipeableStream(result.children, {
  onShellReady() {
    // Shell ready callback without pipe call
  },
});

// Pipe called immediately after getting the function
pipe(passThrough); // Called immediately
```

**Why This Happens**: When `pipe()` is called at any point later than immediately after getting the function, React detects this as a suspense boundary scenario and adds the performance script as part of its internal timing mechanism.

**Prevention**: Always call `pipe()` immediately after getting the function from `renderToPipeableStream`, not at any later point in time.

## 🔧 Development Issues

### 7. Client Dev Server Errors

**Problem**: Client development server fails to start or serve pages.

**Symptoms**:
- `Error: Cannot start dev server`
- Pages not loading in browser
- API routes not working

**Root Cause**: Incorrect publicOrigin on port change

**Solution**:
```typescript
import { createServer } from "vite";
import type { StreamPluginOptions} from "vite-plugin-react-server/types";
import { vitePluginReactServer } from "vite-plugin-react-server";
import type { ViteDevServer } from "vite";

// Ensure proper dev server configuration
const devServer: ViteDevServer = await createDevServer({
  plugins: vitePluginReactServer({
    moduleBase: 'src',
    Page: 'src/page.tsx'
  }),
  server: {
    // strict port behavior, prevents incorrect publicOrigin
    port: 3000,
  },
});
```

**Prevention**: Use unique ports

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
worker.removeAllListeners();
```

**Prevention**: Always implement proper cleanup and monitor memory usage.


## 🔍 Diagnostic Tools

### Debug Logging

Enable comprehensive debug logging:

```typescript
const events = await doBuild({
  projectRoot: '/path/to/project',
  verbose: true,
  onEvent: (event) => {
    console.log(${event});
  },
  onMetrics: (metrics) => {
      // can be a lot of logs, see import { metricWatcher } from "vite-plugin-react-server/metrics"
    console.log({metrics})
  }
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


---

*This documentation covers common issues and their solutions. For specific issues not covered here, refer to the debugging guides or create a new issue in the project repository.*

```typescript
// assuming file is test/examples
import { doBuild } from "../doBuild.js" // always use .js, even for .tsx or .ts files
// use the events to test the api
// the assumption here is if it's useful for tests, it's useful to users to test their application too
// event information can include the entire bundle per environment, and individual file writes for index.rsc and index.html (based on build.pages)
const events = await doBuild({
  projectRoot: '/path/to/project',
  verbose: true,
  onEvent: (event) => {
    console.log(`[${event.type}]`, event.data);
  },
});
```

### Memory Monitoring

Monitor memory usage during builds:

```typescript
const events = await doBuild({
  projectRoot: '/path/to/project',
  verbose: true,
  onMetrics: (metrics) => {
    // log metrics you care about 
  },
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
- [ ] **Tests**: Do tests pass with react-server condition and without?

## 🔗 Related Documentation

- [Debugging Guide](./DEBUGGING.md) - Advanced debugging techniques
- [Error Handling](./ERROR_HANDLING.md) - Error handling patterns
- [Testing Guide](./TESTING.md) - Test troubleshooting

---

*This documentation covers common issues and their solutions. For specific issues not covered here, refer to the debugging guides or create a new issue in the project repository.*
