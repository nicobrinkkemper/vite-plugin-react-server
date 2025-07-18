import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import { fileWriter } from 'vite-plugin-react-server/static';
import { rm } from 'node:fs/promises';
import { createLogger } from 'vite';

describe('fileWriter', () => {
  const testOutputDir = './test-output';
  const testRoute = '/test-route';
  const logger = createLogger();

  beforeEach(async () => {
    // Clean up and create test directory
    try {
      await rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should write file successfully with normal stream', async () => {
    const stream = new Readable({
      read() {
        this.push('Hello, World!');
        this.push(null);
      }
    });

    const options = {
      route: testRoute,
      build: {
        outDir: testOutputDir,
        static: 'static',
        htmlOutputPath: 'index.html',
        rscOutputPath: 'index.rsc',
        pages: [],
        server: 'server',
        client: 'client'
      },
      onEvent: () => {},
      verbose: false,
      logger
    };

    await expect(fileWriter(stream, 'html', options)).resolves.not.toThrow();
  });

  it('should cancel file write when abort signal is triggered', async () => {
    const stream = new Readable({
      read() {
        // Simulate slow stream
        setTimeout(() => {
          this.push('Hello, World!');
          this.push(null);
        }, 100);
      }
    });

    const abortController = new AbortController();
    const options = {
      route: testRoute,
      build: {
        outDir: testOutputDir,
        static: 'static',
        htmlOutputPath: 'index.html',
        rscOutputPath: 'index.rsc',
        pages: [],
        server: 'server',
        client: 'client'
      },
      onEvent: () => {},
      verbose: false,
      logger
    };

    const writePromise = fileWriter(stream, 'html', options, abortController.signal);
    
    // Cancel after a short delay
    setTimeout(() => {
      abortController.abort();
    }, 50);

    await expect(writePromise).resolves.not.toThrow();
  });

  it('should handle missing stream gracefully', async () => {
    const options = {
      route: testRoute,
      build: {
        outDir: testOutputDir,
        static: 'static',
        htmlOutputPath: 'index.html',
        rscOutputPath: 'index.rsc',
        pages: [],
        server: 'server',
        client: 'client'
      },
      onEvent: () => {},
      verbose: false,
      logger
    };

    await expect(fileWriter(null as any, 'html', options)).rejects.toThrow('Missing stream for route: /test-route');
  });

  it('should emit file.write and file.write.done events', async () => {
    const stream = new Readable({
      read() {
        this.push('Test content');
        this.push(null);
      }
    });

    const events: Array<{ type: string; data?: any }> = [];
    const options = {
      route: testRoute,
      build: {
        outDir: testOutputDir,
        static: 'static',
        htmlOutputPath: 'index.html',
        rscOutputPath: 'index.rsc',
        pages: [],
        server: 'server',
        client: 'client'
      },
      onEvent: (event: any) => {
        events.push(event);
      },
      verbose: false,
      logger
    };

    await fileWriter(stream, 'html', options);

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('file.write');
    expect(events[1].type).toBe('file.write.done');
    expect(events[1].data.content).toBe('Test content');
  });
}); 