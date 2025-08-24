# Performance Monitoring & Optimization

This document covers performance monitoring, optimization strategies, and performance characteristics of the `vite-plugin-react-server` project.

## 📊 Performance Characteristics

### Environment Performance Comparison

The plugin supports two React environments with different performance characteristics:

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

## 🎯 Performance Monitoring

### Built-in Metrics Collection

The plugin includes comprehensive metrics collection:

```typescript
interface BuildMetrics {
  page: string;
  phase: 'rsc' | 'html' | 'complete';
  duration: number;
  memoryUsage?: number;
  fileSizes?: {
    rsc?: number;
    html?: number;
  };
  workerStartupTime?: number;
  streamProcessingTime?: number;
}
```

### Metrics Collection Example

```typescript
const events = await doBuild({
  projectRoot: '/path/to/project',
  onMetrics: (metrics) => {
    console.log(`Page: ${metrics.page}`);
    console.log(`Phase: ${metrics.phase}`);
    console.log(`Duration: ${metrics.duration}ms`);
    console.log(`Memory: ${metrics.memoryUsage}MB`);
    console.log(`RSC Size: ${metrics.fileSizes?.rsc} bytes`);
    console.log(`HTML Size: ${metrics.fileSizes?.html} bytes`);
  },
});
```

### Performance Event Types

```typescript
// Performance-related events
interface PerformanceEvent {
  type: 'worker.start' | 'worker.end' | 'page.start' | 'page.end' | 'stream.start' | 'stream.end';
  data: {
    page?: string;
    duration?: number;
    memoryUsage?: number;
    workerType?: 'rsc' | 'html';
  };
  timestamp: number;
}
```

## 🔧 Performance Optimization Strategies

### 1. Worker Pool Management

Optimize worker lifecycle and reuse:

```typescript
export class WorkerPool {
  private workers: Map<string, Worker> = new Map();
  private idleWorkers: Set<string> = new Set();
  
  async getWorker(type: 'rsc' | 'html'): Promise<Worker> {
    // Reuse idle workers when possible
    if (this.idleWorkers.size > 0) {
      const workerId = this.idleWorkers.values().next().value;
      this.idleWorkers.delete(workerId);
      return this.workers.get(workerId)!;
    }
    
    // Create new worker if needed
    return this.createWorker(type);
  }
  
  private async createWorker(type: 'rsc' | 'html'): Promise<Worker> {
    const worker = new Worker(this.getWorkerPath(type));
    const workerId = generateId();
    this.workers.set(workerId, worker);
    return worker;
  }
}
```

### 2. Stream Processing Optimization

Optimize RSC and HTML stream processing:

```typescript
export class OptimizedStreamProcessor {
  private bufferSize = 64 * 1024; // 64KB chunks
  private maxConcurrency = 4;
  
  async processStream(stream: ReadableStream): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunks.push(value);
      
      // Process in chunks to avoid memory issues
      if (chunks.length >= this.maxConcurrency) {
        await this.processChunks(chunks);
      }
    }
    
    return this.concatChunks(chunks);
  }
}
```

### 3. Memory Management

Implement efficient memory management:

```typescript
export class MemoryManager {
  private memoryThreshold = 100 * 1024 * 1024; // 100MB
  private gcInterval = 1000; // 1 second
  
  constructor() {
    setInterval(() => this.checkMemory(), this.gcInterval);
  }
  
  private checkMemory() {
    const memoryUsage = process.memoryUsage();
    
    if (memoryUsage.heapUsed > this.memoryThreshold) {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Log memory usage
      console.warn('High memory usage:', {
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      });
    }
  }
}
```

### 4. Caching Strategies

Implement intelligent caching:

```typescript
export class BuildCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 1000;
  
  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.cache.get(key);
    
    if (entry && !this.isExpired(entry)) {
      return entry;
    }
    
    if (entry) {
      this.cache.delete(key);
    }
    
    return null;
  }
  
  async set(key: string, value: any, ttl: number = 300000): Promise<void> {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entries
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl,
    });
  }
}
```

## 📈 Performance Profiling

### Profiling Tools

Use Node.js built-in profiling:

```typescript
import { performance } from 'perf_hooks';

export class PerformanceProfiler {
  private marks = new Map<string, number>();
  private measures: Array<{ name: string; duration: number }> = [];
  
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }
  
  measure(name: string, startMark: string, endMark: string): void {
    const start = this.marks.get(startMark);
    const end = this.marks.get(endMark);
    
    if (start && end) {
      this.measures.push({
        name,
        duration: end - start,
      });
    }
  }
  
  getMeasures(): Array<{ name: string; duration: number }> {
    return this.measures;
  }
  
  generateReport(): string {
    return this.measures
      .map(m => `${m.name}: ${m.duration.toFixed(2)}ms`)
      .join('\n');
  }
}
```

### Profiling Example

```typescript
const profiler = new PerformanceProfiler();

profiler.mark('build-start');
await doBuild({
  projectRoot: '/path/to/project',
  onEvent: (event) => {
    if (event.type === 'page.start') {
      profiler.mark(`page-${event.data.page}-start`);
    }
    if (event.type === 'page.end') {
      profiler.mark(`page-${event.data.page}-end`);
      profiler.measure(
        `page-${event.data.page}`,
        `page-${event.data.page}-start`,
        `page-${event.data.page}-end`
      );
    }
  },
});
profiler.mark('build-end');
profiler.measure('total-build', 'build-start', 'build-end');

console.log('Performance Report:');
console.log(profiler.generateReport());
```

## 🚀 Performance Recommendations

### For Small Sites (< 50 pages)
- **Environment Choice**: Either environment works well
- **Optimization Focus**: Worker startup time
- **Caching**: Minimal caching needed
- **Memory**: Standard memory management

### For Medium Sites (50-500 pages)
- **Environment Choice**: Prefer server environment for RSC performance
- **Optimization Focus**: Parallel processing and memory management
- **Caching**: Implement build result caching
- **Memory**: Monitor memory usage and implement cleanup

### For Large Sites (> 500 pages)
- **Environment Choice**: Server environment for best performance
- **Optimization Focus**: Worker pool management and stream processing
- **Caching**: Aggressive caching with TTL
- **Memory**: Implement memory monitoring and automatic cleanup

## 🔍 Performance Debugging

### Common Performance Issues

1. **Worker Startup Time**
   - **Symptom**: First page takes 300ms+
   - **Solution**: Implement worker pooling and reuse

2. **Memory Leaks**
   - **Symptom**: Memory usage grows over time
   - **Solution**: Implement proper cleanup and garbage collection

3. **Stream Processing Bottlenecks**
   - **Symptom**: Large pages take too long
   - **Solution**: Optimize stream processing with chunking

4. **Module Resolution Slowdown**
   - **Symptom**: Build times increase with more pages
   - **Solution**: Implement module resolution caching

### Debugging Commands

```bash
# Run with memory profiling
node --inspect --expose-gc your-build-script.js

# Run with CPU profiling
node --prof your-build-script.js

# Analyze CPU profile
node --prof-process isolate-*.log > profile.txt
```

## 📊 Performance Benchmarks

### Benchmark Suite

The project includes performance benchmarks:

```typescript
// test/performance/benchmark.ts
export async function runBenchmarks() {
  const results = {
    workerStartup: await benchmarkWorkerStartup(),
    pageGeneration: await benchmarkPageGeneration(),
    streamProcessing: await benchmarkStreamProcessing(),
    memoryUsage: await benchmarkMemoryUsage(),
  };
  
  return results;
}
```

### Benchmark Results

Typical benchmark results for a medium-sized site:

```
Worker Startup:
  - Server Environment: 116ms
  - Client Environment: 349ms

Page Generation (warm):
  - Server Environment: 1-30ms per page
  - Client Environment: 5-26ms per page

Memory Usage:
  - Peak: ~150MB for 100 pages
  - Sustained: ~50MB after cleanup

Stream Processing:
  - RSC: 0.74ms (server) vs 5.38ms (client)
  - HTML: ~5ms (both environments)
```

## 🔗 Related Documentation

- [Build Process](./BUILD_PROCESS.md) - Build performance optimization
- [Plugin Architecture](./PLUGIN_ARCHITECTURE.md) - Architecture performance implications
- [Testing Guide](./TESTING.md) - Performance testing strategies
- [Environment API Guide](./ENVIRONMENT_API.md) - Environment-specific performance

---

*This documentation covers performance monitoring and optimization. For specific performance issues, refer to the troubleshooting guides.*
