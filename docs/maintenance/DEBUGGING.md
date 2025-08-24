# Debugging Guide

This document provides comprehensive debugging techniques, tools, and strategies for troubleshooting issues in the `vite-plugin-react-server` project.

## 🔍 Debugging Fundamentals

### Debugging Mindset

1. **Reproduce the Issue**: Create a minimal reproduction case
2. **Isolate the Problem**: Identify the specific component or code path
3. **Gather Information**: Collect logs, metrics, and error details
4. **Form Hypothesis**: Develop theories about the root cause
5. **Test Solutions**: Implement and verify fixes
6. **Document**: Record the solution for future reference

### Debugging Tools

The project provides several built-in debugging tools:

```typescript
// Enable verbose logging
const events = await doBuild({
  projectRoot: '/path/to/project',
  verbose: true,
  debug: true,
});

// Enable event monitoring
const events = await doBuild({
  projectRoot: '/path/to/project',
  onEvent: (event) => {
    console.log(`[${event.type}]`, event.data);
  },
  onMetrics: (metrics) => {
    console.log('Metrics:', metrics);
  },
});
```

## 🛠️ Debugging Techniques

### 1. Event-Driven Debugging

Monitor build events to understand the process flow:

```typescript
const eventLog: BuildEvent[] = [];

const events = await doBuild({
  projectRoot: '/path/to/project',
  onEvent: (event) => {
    eventLog.push(event);
    
    // Log specific events
    switch (event.type) {
      case 'build.start':
        console.log('🚀 Build started');
        break;
      case 'page.start':
        console.log(`📄 Processing page: ${event.data.page}`);
        break;
      case 'worker.start':
        console.log(`🔧 Worker started: ${event.data.workerType}`);
        break;
      case 'error':
        console.error('❌ Error:', event.data);
        break;
    }
  },
});

// Analyze event sequence
console.log('Event sequence:', eventLog.map(e => e.type));
```

### 2. Performance Debugging

Use performance marks and measures to identify bottlenecks:

```typescript
import { performance } from 'perf_hooks';

class PerformanceDebugger {
  private marks = new Map<string, number>();
  private measures: Array<{ name: string; duration: number }> = [];
  
  mark(name: string): void {
    this.marks.set(name, performance.now());
    console.log(`⏱️ Mark: ${name}`);
  }
  
  measure(name: string, startMark: string, endMark: string): void {
    const start = this.marks.get(startMark);
    const end = this.marks.get(endMark);
    
    if (start && end) {
      const duration = end - start;
      this.measures.push({ name, duration });
      console.log(`📊 Measure: ${name} = ${duration.toFixed(2)}ms`);
    }
  }
  
  generateReport(): string {
    return this.measures
      .sort((a, b) => b.duration - a.duration)
      .map(m => `${m.name}: ${m.duration.toFixed(2)}ms`)
      .join('\n');
  }
}

// Usage
const debugger = new PerformanceDebugger();

debugger.mark('build-start');
await doBuild(options);
debugger.mark('build-end');
debugger.measure('total-build', 'build-start', 'build-end');

console.log('Performance Report:');
console.log(debugger.generateReport());
```

### 3. Memory Debugging

Monitor memory usage to detect leaks:

```typescript
class MemoryDebugger {
  private snapshots: Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> = [];
  
  snapshot(label: string): void {
    const usage = process.memoryUsage();
    this.snapshots.push({ timestamp: Date.now(), usage });
    
    console.log(`💾 Memory [${label}]:`, {
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
    });
  }
  
  compare(): void {
    if (this.snapshots.length < 2) return;
    
    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    
    const heapUsedDiff = last.usage.heapUsed - first.usage.heapUsed;
    const heapTotalDiff = last.usage.heapTotal - first.usage.heapTotal;
    
    console.log('📈 Memory Growth:', {
      heapUsed: `${Math.round(heapUsedDiff / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(heapTotalDiff / 1024 / 1024)}MB`,
    });
  }
}

// Usage
const memoryDebugger = new MemoryDebugger();

memoryDebugger.snapshot('before-build');
await doBuild(options);
memoryDebugger.snapshot('after-build');
memoryDebugger.compare();
```

### 4. Worker Debugging

Debug worker communication and lifecycle:

```typescript
class WorkerDebugger {
  private workerLogs: Array<{ timestamp: number; type: string; data: any }> = [];
  
  attachToWorker(worker: Worker): void {
    worker.on('message', (message) => {
      this.workerLogs.push({
        timestamp: Date.now(),
        type: 'message',
        data: message,
      });
      console.log(`🔧 Worker message:`, message);
    });
    
    worker.on('error', (error) => {
      this.workerLogs.push({
        timestamp: Date.now(),
        type: 'error',
        data: error,
      });
      console.error(`❌ Worker error:`, error);
    });
    
    worker.on('exit', (code) => {
      this.workerLogs.push({
        timestamp: Date.now(),
        type: 'exit',
        data: { code },
      });
      console.log(`🔚 Worker exited with code: ${code}`);
    });
  }
  
  getLogs(): Array<{ timestamp: number; type: string; data: any }> {
    return this.workerLogs;
  }
}

// Usage
const workerDebugger = new WorkerDebugger();
const worker = new Worker(workerPath);
workerDebugger.attachToWorker(worker);
```

## 🔧 Advanced Debugging Tools

### 1. Node.js Inspector

Use Node.js built-in debugging tools:

```bash
# Start with inspector
node --inspect --expose-gc your-build-script.js

# Start with inspector and break on first line
node --inspect-brk --expose-gc your-build-script.js

# Start with inspector and allow external connections
node --inspect=0.0.0.0:9229 --expose-gc your-build-script.js
```

### 2. CPU Profiling

Generate and analyze CPU profiles:

```bash
# Generate CPU profile
node --prof your-build-script.js

# Analyze CPU profile
node --prof-process isolate-*.log > profile.txt

# View profile in browser
node --prof-process --preprocess isolate-*.log > profile.json
```

### 3. Heap Profiling

Analyze memory usage and detect leaks:

```typescript
import { writeHeapSnapshot } from 'v8';

// Take heap snapshot
writeHeapSnapshot(`heap-${Date.now()}.heapsnapshot`);
```

### 4. Stream Debugging

Debug stream processing issues:

```typescript
class StreamDebugger {
  private chunks: Uint8Array[] = [];
  private totalSize = 0;
  
  async debugStream(stream: ReadableStream, label: string): Promise<Uint8Array> {
    console.log(`🔍 Debugging stream: ${label}`);
    
    const reader = stream.getReader();
    let chunkCount = 0;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log(`✅ Stream complete: ${chunkCount} chunks, ${this.totalSize} bytes`);
          break;
        }
        
        chunkCount++;
        this.totalSize += value.length;
        this.chunks.push(value);
        
        console.log(`📦 Chunk ${chunkCount}: ${value.length} bytes`);
      }
    } finally {
      reader.releaseLock();
    }
    
    return Buffer.concat(this.chunks);
  }
}

// Usage
const streamDebugger = new StreamDebugger();
const rscContent = await streamDebugger.debugStream(rscStream, 'RSC Stream');
```

## 🐛 Common Debugging Scenarios

### 1. Build Hangs

**Symptoms**: Build process never completes, no error messages.

**Debugging Steps**:
```typescript
// 1. Add timeouts
const events = await doBuild({
  projectRoot: '/path/to/project',
  timeout: 30000, // 30 second timeout
});

// 2. Monitor worker lifecycle
const events = await doBuild({
  projectRoot: '/path/to/project',
  onEvent: (event) => {
    if (event.type === 'worker.start') {
      console.log('Worker started:', event.data);
    }
    if (event.type === 'worker.end') {
      console.log('Worker ended:', event.data);
    }
  },
});

// 3. Check for specific page issues
const events = await doBuild({
  projectRoot: '/path/to/project',
  pages: ['/'], // Start with single page
});
```

### 2. Memory Leaks

**Symptoms**: Memory usage grows over time, build slowdown.

**Debugging Steps**:
```typescript
// 1. Monitor memory usage
const memoryUsage = process.memoryUsage();
console.log('Memory:', {
  heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
  heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
});

// 2. Force garbage collection
if (global.gc) {
  global.gc();
}

// 3. Check for retained references
const heapSnapshot = writeHeapSnapshot();
```

### 3. Worker Communication Issues

**Symptoms**: Workers not responding, build fails silently.

**Debugging Steps**:
```typescript
// 1. Monitor worker messages
const workerDebugger = new WorkerDebugger();
workerDebugger.attachToWorker(worker);

// 2. Check worker lifecycle
worker.on('message', (message) => {
  console.log('Worker message:', message);
});

worker.on('error', (error) => {
  console.error('Worker error:', error);
});

worker.on('exit', (code) => {
  console.log('Worker exit:', code);
});

// 3. Test worker isolation
const testWorker = new Worker(workerPath);
testWorker.postMessage({ type: 'test' });
```

### 4. Stream Processing Issues

**Symptoms**: Empty files, incorrect content, processing errors.

**Debugging Steps**:
```typescript
// 1. Debug stream content
const streamDebugger = new StreamDebugger();
const content = await streamDebugger.debugStream(stream, 'Test Stream');

// 2. Check stream state
console.log('Stream state:', {
  locked: stream.locked,
  readable: stream.readable,
});

// 3. Validate stream processing
const reader = stream.getReader();
const chunks: Uint8Array[] = [];

try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
} finally {
  reader.releaseLock();
}

console.log('Processed chunks:', chunks.length);
console.log('Total size:', chunks.reduce((sum, chunk) => sum + chunk.length, 0));
```

## 📊 Debugging Reports

### Generate Debug Report

Create comprehensive debugging reports:

```typescript
class DebugReport {
  private events: BuildEvent[] = [];
  private metrics: BuildMetrics[] = [];
  private errors: Error[] = [];
  
  addEvent(event: BuildEvent): void {
    this.events.push(event);
  }
  
  addMetrics(metrics: BuildMetrics): void {
    this.metrics.push(metrics);
  }
  
  addError(error: Error): void {
    this.errors.push(error);
  }
  
  generateReport(): string {
    const report = [
      '# Debug Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Summary',
      `- Total Events: ${this.events.length}`,
      `- Total Metrics: ${this.metrics.length}`,
      `- Total Errors: ${this.errors.length}`,
      '',
      '## Events',
      ...this.events.map(e => `- ${e.type}: ${JSON.stringify(e.data)}`),
      '',
      '## Metrics',
      ...this.metrics.map(m => `- ${m.page} (${m.phase}): ${m.duration}ms`),
      '',
      '## Errors',
      ...this.errors.map(e => `- ${e.message}`),
    ];
    
    return report.join('\n');
  }
}

// Usage
const report = new DebugReport();

const events = await doBuild({
  projectRoot: '/path/to/project',
  onEvent: (event) => report.addEvent(event),
  onMetrics: (metrics) => report.addMetrics(metrics),
});

console.log(report.generateReport());
```

## 🔗 Related Documentation

- [Common Issues](./COMMON_ISSUES.md) - Common problems and solutions
- [Error Handling](./ERROR_HANDLING.md) - Error handling patterns
- [Performance Monitoring](./PERFORMANCE.md) - Performance debugging
- [Testing Guide](./TESTING.md) - Test debugging strategies

---

*This documentation covers debugging techniques and tools. For specific issues, refer to the common issues guide or create a new issue in the project repository.*
