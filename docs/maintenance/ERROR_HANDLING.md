# Error Handling Guide

This document covers error handling patterns, error types, and error recovery strategies in the `vite-plugin-react-server` project.

## 🚨 Error Handling Philosophy

### Core Principles

1. **Fail Fast**: Detect errors early and fail immediately
2. **Fail Loud**: Provide clear, actionable error messages
3. **Fail Gracefully**: Handle errors without crashing the entire system
4. **Recover When Possible**: Attempt recovery for recoverable errors
5. **Log Everything**: Maintain comprehensive error logs for debugging

### Error Handling Strategy

```typescript
// Centralized error handling
class ErrorHandler {
  private errors: Error[] = [];
  private panicThreshold: 'none' | 'first_error' | 'all_errors';
  
  constructor(options: ErrorHandlerOptions) {
    this.panicThreshold = options.panicThreshold || 'first_error';
  }
  
  handleError(error: Error, context: ErrorContext): void {
    // Log error
    this.logError(error, context);
    
    // Store error
    this.errors.push(error);
    
    // Determine if build should continue
    if (this.shouldPanic()) {
      throw new PluginError(
        `Build failed: ${error.message}`,
        'BUILD_FAILED',
        { originalError: error, context }
      );
    }
  }
  
  private shouldPanic(): boolean {
    switch (this.panicThreshold) {
      case 'none':
        return false;
      case 'first_error':
        return this.errors.length === 1;
      case 'all_errors':
        return true;
      default:
        return false;
    }
  }
}
```

## 🔍 Error Types

### PluginError Class

Custom error class for plugin-specific errors:

```typescript
export class PluginError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

// Error codes
export const ERROR_CODES = {
  BUILD_FAILED: 'BUILD_FAILED',
  WORKER_ERROR: 'WORKER_ERROR',
  TRANSFORM_ERROR: 'TRANSFORM_ERROR',
  LOADER_ERROR: 'LOADER_ERROR',
  STREAM_ERROR: 'STREAM_ERROR',
  CONFIG_ERROR: 'CONFIG_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;
```

### Error Categories

#### 1. Build Errors
```typescript
// Build process failures
throw new PluginError(
  'Build process failed due to worker error',
  ERROR_CODES.BUILD_FAILED,
  { workerType: 'rsc', page: '/home' }
);
```

#### 2. Worker Errors
```typescript
// Worker communication or processing errors
throw new PluginError(
  'RSC worker failed to render page',
  ERROR_CODES.WORKER_ERROR,
  { workerType: 'rsc', page: '/home', error: originalError }
);
```

#### 3. Transform Errors
```typescript
// Component transformation errors
throw new PluginError(
  'Failed to transform client component',
  ERROR_CODES.TRANSFORM_ERROR,
  { file: 'src/components/Button.tsx', error: originalError }
);
```

#### 4. Loader Errors
```typescript
// Module loading errors
throw new PluginError(
  'Failed to load module',
  ERROR_CODES.LOADER_ERROR,
  { modulePath: 'src/pages/home.tsx', error: originalError }
);
```

#### 5. Stream Errors
```typescript
// Stream processing errors
throw new PluginError(
  'RSC stream processing failed',
  ERROR_CODES.STREAM_ERROR,
  { streamType: 'rsc', page: '/home', error: originalError }
);
```

## 🛠️ Error Handling Patterns

### 1. Try-Catch with Context

```typescript
async function processPage(page: string, options: BuildOptions): Promise<BuildResult> {
  const context: ErrorContext = {
    source: 'processPage',
    page,
    phase: 'rsc',
  };
  
  try {
    const rscResult = await rscWorker.render(page);
    return rscResult;
  } catch (error) {
    errorHandler.handleError(error, context);
    
    // Return fallback or re-throw based on error type
    if (error instanceof PluginError && error.code === ERROR_CODES.WORKER_ERROR) {
      return createFallbackResult(page);
    }
    
    throw error;
  }
}
```

### 2. Error Boundaries

```typescript
class BuildErrorBoundary {
  private errorHandler: ErrorHandler;
  
  constructor(errorHandler: ErrorHandler) {
    this.errorHandler = errorHandler;
  }
  
  async execute<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      this.errorHandler.handleError(error, context);
      return null;
    }
  }
}

// Usage
const boundary = new BuildErrorBoundary(errorHandler);
const result = await boundary.execute(
  () => rscWorker.render(page),
  { source: 'rscWorker', page, phase: 'rsc' }
);
```

### 3. Retry Logic

```typescript
class RetryHandler {
  private maxRetries: number;
  private retryDelay: number;
  
  constructor(options: { maxRetries: number; retryDelay: number }) {
    this.maxRetries = options.maxRetries;
    this.retryDelay = options.retryDelay;
  }
  
  async withRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < this.maxRetries) {
          console.warn(`Attempt ${attempt} failed, retrying in ${this.retryDelay}ms:`, error.message);
          await this.delay(this.retryDelay);
        }
      }
    }
    
    throw new PluginError(
      `Operation failed after ${this.maxRetries} attempts`,
      ERROR_CODES.BUILD_FAILED,
      { originalError: lastError, context, attempts: this.maxRetries }
    );
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage
const retryHandler = new RetryHandler({ maxRetries: 3, retryDelay: 1000 });
const result = await retryHandler.withRetry(
  () => rscWorker.render(page),
  { source: 'rscWorker', page, phase: 'rsc' }
);
```

### 4. Graceful Degradation

```typescript
class GracefulDegradation {
  private errorHandler: ErrorHandler;
  
  constructor(errorHandler: ErrorHandler) {
    this.errorHandler = errorHandler;
  }
  
  async processPage(page: string): Promise<BuildResult> {
    try {
      // Try full RSC rendering
      return await rscWorker.render(page);
    } catch (error) {
      this.errorHandler.handleError(error, { source: 'rscWorker', page });
      
      try {
        // Fallback to static HTML
        console.warn(`Falling back to static HTML for page: ${page}`);
        return await this.generateStaticHTML(page);
      } catch (fallbackError) {
        this.errorHandler.handleError(fallbackError, { source: 'staticHTML', page });
        
        // Final fallback to error page
        return this.generateErrorPage(page, error);
      }
    }
  }
  
  private async generateStaticHTML(page: string): Promise<BuildResult> {
    // Generate basic HTML without RSC
    return {
      html: `<html><body><h1>${page}</h1><p>Static fallback</p></body></html>`,
      rsc: null,
    };
  }
  
  private generateErrorPage(page: string, error: Error): BuildResult {
    return {
      html: `<html><body><h1>Error</h1><p>Failed to render ${page}</p><pre>${error.message}</pre></body></html>`,
      rsc: null,
    };
  }
}
```

## 🔄 Error Recovery Strategies

### 1. Worker Recovery

```typescript
class WorkerManager {
  private workers: Map<string, Worker> = new Map();
  private errorHandler: ErrorHandler;
  
  constructor(errorHandler: ErrorHandler) {
    this.errorHandler = errorHandler;
  }
  
  async getWorker(type: 'rsc' | 'html'): Promise<Worker> {
    const workerKey = `${type}-worker`;
    let worker = this.workers.get(workerKey);
    
    if (!worker || worker.exitCode !== null) {
      // Create new worker if none exists or current worker is dead
      worker = await this.createWorker(type);
      this.workers.set(workerKey, worker);
    }
    
    return worker;
  }
  
  private async createWorker(type: 'rsc' | 'html'): Promise<Worker> {
    const worker = new Worker(this.getWorkerPath(type));
    
    // Set up error handling
    worker.on('error', (error) => {
      this.errorHandler.handleError(error, {
        source: 'worker',
        workerType: type,
      });
    });
    
    worker.on('exit', (code) => {
      if (code !== 0) {
        this.errorHandler.handleError(
          new Error(`Worker exited with code ${code}`),
          { source: 'worker', workerType: type, exitCode: code }
        );
      }
    });
    
    return worker;
  }
}
```

### 2. Stream Recovery

```typescript
class StreamRecovery {
  async processStream(stream: ReadableStream, context: ErrorContext): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        chunks.push(value);
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      // Attempt to recover partial content
      if (chunks.length > 0) {
        console.warn('Stream processing failed, returning partial content');
        return Buffer.concat(chunks);
      }
      
      throw new PluginError(
        'Stream processing failed completely',
        ERROR_CODES.STREAM_ERROR,
        { originalError: error, context }
      );
    } finally {
      reader.releaseLock();
    }
  }
}
```

### 3. Configuration Recovery

```typescript
class ConfigurationValidator {
  validateConfig(config: PluginOptions): void {
    const errors: string[] = [];
    
    if (!config.projectRoot) {
      errors.push('projectRoot is required');
    }
    
    if (!path.isAbsolute(config.projectRoot)) {
      errors.push('projectRoot must be an absolute path');
    }
    
    if (errors.length > 0) {
      throw new PluginError(
        `Configuration validation failed: ${errors.join(', ')}`,
        ERROR_CODES.VALIDATION_ERROR,
        { errors }
      );
    }
  }
  
  sanitizeConfig(config: PluginOptions): PluginOptions {
    return {
      projectRoot: path.resolve(config.projectRoot || process.cwd()),
      pages: config.pages || [],
      verbose: config.verbose || false,
      panicThreshold: config.panicThreshold || 'first_error',
      ...config,
    };
  }
}
```

## 📊 Error Reporting

### Error Reporter

```typescript
class ErrorReporter {
  private errors: Array<{
    error: Error;
    context: ErrorContext;
    timestamp: number;
    stack?: string;
  }> = [];
  
  addError(error: Error, context: ErrorContext): void {
    this.errors.push({
      error,
      context,
      timestamp: Date.now(),
      stack: error.stack,
    });
  }
  
  generateReport(): string {
    const report = [
      '# Error Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Total Errors: ${this.errors.length}`,
      '',
    ];
    
    this.errors.forEach((entry, index) => {
      report.push(
        `## Error ${index + 1}`,
        `**Time**: ${new Date(entry.timestamp).toISOString()}`,
        `**Source**: ${entry.context.source}`,
        `**Message**: ${entry.error.message}`,
        `**Stack**:`,
        '```',
        entry.stack || 'No stack trace',
        '```',
        ''
      );
    });
    
    return report.join('\n');
  }
  
  getErrorSummary(): {
    total: number;
    bySource: Record<string, number>;
    byType: Record<string, number>;
  } {
    const bySource: Record<string, number> = {};
    const byType: Record<string, number> = {};
    
    this.errors.forEach(entry => {
      bySource[entry.context.source] = (bySource[entry.context.source] || 0) + 1;
      
      const errorType = entry.error instanceof PluginError ? entry.error.code : 'UNKNOWN';
      byType[errorType] = (byType[errorType] || 0) + 1;
    });
    
    return {
      total: this.errors.length,
      bySource,
      byType,
    };
  }
}
```

### Error Metrics

```typescript
interface ErrorMetrics {
  totalErrors: number;
  errorRate: number; // errors per operation
  recoveryRate: number; // successful recoveries per error
  averageRecoveryTime: number;
  errorDistribution: Record<string, number>;
}

class ErrorMetricsCollector {
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    errorRate: 0,
    recoveryRate: 0,
    averageRecoveryTime: 0,
    errorDistribution: {},
  };
  
  recordError(error: Error, context: ErrorContext): void {
    this.metrics.totalErrors++;
    
    const errorType = error instanceof PluginError ? error.code : 'UNKNOWN';
    this.metrics.errorDistribution[errorType] = 
      (this.metrics.errorDistribution[errorType] || 0) + 1;
  }
  
  recordRecovery(recoveryTime: number): void {
    // Update recovery metrics
  }
  
  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }
}
```

## 🔗 Related Documentation

- [Debugging Guide](./DEBUGGING.md) - Advanced debugging techniques
- [Error Handling](./ERROR_HANDLING.md) - Error handling patterns
- [Testing Guide](./TESTING.md) - Test troubleshooting


---

*This documentation covers error handling patterns and strategies. For specific error scenarios, refer to the common issues guide.*
