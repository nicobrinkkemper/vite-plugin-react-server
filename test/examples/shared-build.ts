import { testUserOptions } from '../test-config.js';
import { readdir, readFile, mkdir, rm } from 'fs/promises';
import { resolve, join } from 'node:path';
import { getCondition } from '../../plugin/config/getCondition.js';
import { doBuild } from '../doBuild.js';

export interface SharedBuildResult {
  testDir: string;
  distDir: string;
  staticFiles: string[];
  serverFiles: string[];
  clientFiles: string[];
  allFiles: string[];
  events: any[];
  metrics: any[];
}

export interface SharedBuildOptions {
  // Setup options - handled by the utility
  setupProject?: (testDir: string) => Promise<void>;
  dir?: string;
  
  // Plugin options - passed through directly to doBuild
  [key: string]: any; // Allow any plugin option to be passed through
}

// Cache for setup function results (fixtures) only
const setupCache = new Map<string, string>();

export async function getSharedBuild(
  testName: string,
  options: SharedBuildOptions = {}
): Promise<SharedBuildResult> {
  // Create a cache key for setup function results only (not plugin options)
  const isDefaultSetup = options.setupProject === setupTestProject;
  const setupKey = isDefaultSetup
    ? `default-setup-${options.dir ?? 'shared'}`
    : `${testName}-${options.dir ?? 'shared'}`;

  let testDir: string;

  // Check if setup is already cached
  if (setupCache.has(setupKey)) {
    testDir = setupCache.get(setupKey)!;
  } else {
    // Create new test directory and run setup
    testDir = isDefaultSetup
      ? resolve(__dirname, `../fixtures/${options.dir ?? 'shared'}/${getCondition()}/shared`)
      : resolve(__dirname, `../fixtures/${options.dir ?? 'shared'}/${getCondition()}/${testName}`);

    await mkdir(testDir, { recursive: true });

    // Setup project files
    if (options.setupProject) {
      await options.setupProject(testDir);
    } else {
      await setupTestProject(testDir);
    }

    // Cache the setup result
    setupCache.set(setupKey, testDir);
  }

  // Extract setup options (excluding them from plugin options)
  const { setupProject, dir, ...pluginOptions } = options;

  // Build the project with ALL plugin options passed through directly
  // Plugin options are NOT cached - they're applied fresh each time
  const events: any[] = [];
  const metrics: any[] = [];
  
  await doBuild({
    ...testUserOptions,
    projectRoot: testDir,
    build: {
      ...testUserOptions.build,
      pages: 'pages' in pluginOptions ? pluginOptions.pages : testUserOptions!.build!.pages,
    },
    // Pass through ALL plugin options directly - no manual handling needed
    ...pluginOptions,
    onEvent: (event) => {
      events.push(event);
      if(typeof pluginOptions.onEvent === 'function') {
        pluginOptions.onEvent(event);
      }
    },
    onMetrics: (metric) => {
      metrics.push(metric);
      if(typeof pluginOptions.onMetrics === 'function') {
        pluginOptions.onMetrics(metric);
      }
    },
  });

  // Get all files from the dist directory
  const distDir = join(testDir, 'dist');
  const allFiles = await getAllFiles(distDir);

  // Separate files by type
  const staticFiles = allFiles.filter(
    (f) => f.includes('/static/') && !f.endsWith('.map')
  );
  const serverFiles = allFiles.filter(
    (f) => f.includes('/server/') && !f.endsWith('.map')
  );
  const clientFiles = allFiles.filter(
    (f) => f.includes('/client/') && !f.endsWith('.map')
  );

  const result: SharedBuildResult = {
    testDir,
    distDir,
    staticFiles,
    serverFiles,
    clientFiles,
    allFiles,
    events,
    metrics,
  };

  return result;
}

async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const items = await readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...(await getAllFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function setupTestProject(testDir: string): Promise<void> {
  const { setupTestProject } = await import('../setup.js');
  await setupTestProject(testDir);
}

export async function cleanupSharedBuilds(): Promise<void> {
  for (const build of setupCache.values()) {
    try {
      await rm(build, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  setupCache.clear();
}

// Helper function to read file content
export async function readFileContent(filePath: string): Promise<string> {
  return await readFile(filePath, 'utf-8');
}

// Helper function to check if any file contains text
export async function anyFileContains(files: string[], text: string): Promise<boolean> {
  for (const file of files) {
    if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = await readFileContent(file);
      if (content.includes(text)) {
        return true;
      }
    }
  }
  return false;
}

// Helper function to find files by pattern
export function findFilesByPattern(files: string[], pattern: string): string[] {
  return files.filter(f => f.includes(pattern));
}

// Helper functions for extracting content from events
export function getHtmlContentFromEvents(events: any[]): string[] {
  return events
    .filter(e => e.type === 'file.write.done' && e.data.fileType === 'html')
    .map(e => e.data.content)
    .filter(Boolean);
}

export function getRscContentFromEvents(events: any[]): string[] {
  return events
    .filter(e => e.type === 'file.write.done' && e.data.fileType === 'rsc')
    .map(e => e.data.content)
    .filter(Boolean);
}

export function checkBuildEventOrder(events: any[]): boolean {
  const eventTypes = events.map(e => e.type);
  const hasStart = eventTypes.includes('build.start');
  const hasEnd = eventTypes.includes('build.ssg.end');
  return hasStart && hasEnd && eventTypes.indexOf('build.start') < eventTypes.indexOf('build.ssg.end');
}

export function getBuildStartEvent(events: any[]): any {
  return events.find(e => e.type === 'build.start');
}

export function validateRscStreamingFormat(content: string): boolean {
  // Check for RSC streaming format (entries starting with numbers)
  return /\d+:/m.test(content) && content.length > 0;
}
