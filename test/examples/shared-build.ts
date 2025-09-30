import { testUserOptions } from "../test-config.js";
import { readdir, readFile, mkdir, rm } from "fs/promises";
import { resolve, join } from "node:path";
import { doBuild } from "../doBuild.js";
import { OutputAsset, OutputBundle, OutputChunk } from "rollup";
import { access } from "node:fs/promises";
import { getCondition } from "../../dist/plugin/config/getCondition.js";
import { FileWriteDoneEvent, PluginEvent } from "../../dist/plugin/types.js";

export interface SharedBuildResult {
  testDir: string;
  distDir: string;
  staticBundle: OutputBundle;
  serverBundle: OutputBundle;
  clientBundle: OutputBundle;
  // entries with [file, content]
  staticFiles: () => string[][];
  serverFiles: () => string[][];
  clientFiles: () => string[][];
  // entries with [chunk, content]
  clientChunks: () => string[][];
  serverChunks: () => string[][];
  staticChunks: () => string[][];
  // entries with [asset, content]
  clientAssets: () => string[][];
  serverAssets: () => string[][];
  staticAssets: () => string[][];
  // html files
  htmlFiles: () => string[][];
  // rsc files
  rscFiles: () => string[][];
  events: any[];
  metrics: any[];
}

const entryToString = (entry: [string, OutputChunk | OutputAsset]) =>
{
  if (isChunk(entry)) {
    return chunkToString(entry);
  }
  if (isAsset(entry)) {
    return assetToString(entry);
  }
  throw new Error("Entry is invalid, neither chunk nor asset");
}

const isChunk = (
  entry: [string, OutputChunk | OutputAsset]
): entry is [string, OutputChunk] => entry[1].type === "chunk";
const chunkToString = (entry: [string, OutputChunk]) =>
  [entry[0], entry[1].code.toString()];

const isAsset = (
  entry: [string, OutputChunk | OutputAsset]
): entry is [string, OutputAsset] => entry[1].type === "asset";
const assetToString = (entry: [string, OutputAsset]) =>
  [entry[0], entry[1].source.toString()];

const noMap = (entry: [string, OutputChunk | OutputAsset]) =>
  !entry[0].endsWith(".map");

const isHtmlGeneratedEvent = (event: PluginEvent): event is FileWriteDoneEvent & { data: { fileType: "html" } } => event.type === "file.write.done" && event.data.fileType === "html";

const isRscGeneratedEvent = (event: PluginEvent): event is FileWriteDoneEvent & { data: { fileType: "rsc" } } => event.type === "file.write.done" && event.data.fileType === "rsc";

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
  sharedTestName: string,
  actualTestName: string,
  options: SharedBuildOptions = {}
): Promise<SharedBuildResult> {
  // Create a cache key for setup function results only (not plugin options)
  const isDefaultSetup = options.setupProject === setupTestProject;
  const setupKey = isDefaultSetup
    ? `test-project-${options.dir ?? "shared"}`
    : `${sharedTestName}-${options.dir ?? "shared"}`;

  let testDir: string;

  // Check if setup is already cached
  if (setupCache.has(setupKey)) {
    testDir = setupCache.get(setupKey)!;
  } else {
    // Create new test directory and run setup
    testDir = isDefaultSetup
      ? resolve(
          __dirname,
          `../fixtures/${options.dir ?? "shared"}/shared`
        )
      : resolve(
          __dirname,
          `../fixtures/${options.dir ?? "shared"}/${sharedTestName}`
        );
    // if directory already exists, skip setup
    try {
      await access(testDir);
      setupCache.set(setupKey, testDir);
    } catch (error) {
      // directory does not exist, create it
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

  }

  // Extract setup options (excluding them from plugin options)
  const { setupProject, dir, ...pluginOptions } = options;

  // Build the project with ALL plugin options passed through directly
  // Plugin options are NOT cached - they're applied fresh each time

  const buildResult = await doBuild({
    ...testUserOptions,
    projectRoot: testDir,
    build: {
      ...testUserOptions.build,
      // modify outDir so we can inspect both dists after the tests
      // will be dist-${actualTestName}-${condition}
      // use shared setup but different dist directory by default
      outDir: options?.build?.outDir ?? (testUserOptions.build.outDir  + getCondition(`-${actualTestName}-`)),
      pages:
        "pages" in pluginOptions
          ? pluginOptions.pages
          : testUserOptions!.build!.pages,
    },
    // Pass through ALL plugin options directly - no manual handling needed
    ...pluginOptions,
    // Don't collect events/metrics here since doBuild already collects them internally
    // This prevents double collection and duplicate metrics
  });

  // Extract events and metrics from the build result
  const events = buildResult.events || [];
  const metrics = buildResult.metrics || [];

  const staticBundleEvent = buildResult.events.find(
    (e) => e.type === "build.writeBundle.static"
  );
  const clientBundleEvent = buildResult.events.find(
    (e) => e.type === "build.writeBundle.client"
  );
  const serverBundleEvent = buildResult.events.find(
    (e) => e.type === "build.writeBundle.server"
  );
  const staticBundle = staticBundleEvent?.data.bundle;
  const clientBundle = clientBundleEvent?.data.bundle;
  const serverBundle = serverBundleEvent?.data.bundle;
  const staticEntries = Object.entries(staticBundle ?? {});
  const clientEntries = Object.entries(clientBundle ?? {});
  const serverEntries = Object.entries(serverBundle ?? {});

  const staticFiles = () =>
    staticEntries
      .filter(noMap)
      .map(entryToString);
  const serverFiles = () =>
    serverEntries
      .filter(noMap)
      .map(entryToString);
  const clientFiles = () =>
    clientEntries
      .filter(noMap)
      .map(entryToString);

  const clientChunks = () => clientEntries.filter(isChunk).map(chunkToString);
  const serverChunks = () => serverEntries.filter(isChunk).map(chunkToString);
  const staticChunks = () => staticEntries.filter(isChunk).map(chunkToString);
  const clientAssets = () => clientEntries.filter(isAsset).map(assetToString);
  const serverAssets = () => serverEntries.filter(isAsset).map(assetToString);
  const staticAssets = () => staticEntries.filter(isAsset).map(assetToString);

  const htmlFiles = () => events.filter(isHtmlGeneratedEvent).map(e => [e.data.path, e.data.content]);
  const rscFiles = () => events.filter(isRscGeneratedEvent).map(e => [e.data.path, e.data.content]);

  // Get all files from the dist directory
  const distDir = join(testDir, "dist");

  // Separate files by type
  if (!staticBundle || !serverBundle || !clientBundle) {
    throw new Error("Static, server, or client bundle not found");
  }

  const result: SharedBuildResult = {
    testDir,
    distDir,
    staticBundle: staticBundle,
    serverBundle: serverBundle,
    clientBundle: clientBundle,
    events,
    metrics,
    staticFiles,
    serverFiles,
    clientFiles,
    clientChunks,
    serverChunks,
    staticChunks,
    clientAssets,
    serverAssets,
    staticAssets,
    htmlFiles,
    rscFiles,
  };

  return result;
}

async function setupTestProject(testDir: string): Promise<void> {
  const { setupTestProject } = await import("../setup.js");
  await setupTestProject(testDir);
}

export async function cleanupSharedBuilds(): Promise<void> {
  // Clean up build directories
  for (const build of setupCache.values()) {
    try {
      await rm(build, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  setupCache.clear();
}

// Helper function to read file content (deprecated - use getFileContentFromEvents instead)

/**
 * Read directly from the file system. Not recommended for all tests, instead use 
 * the bundle event to get the file contents. Reading a file should be a last resort.
 */
export async function readFileContent(filePath: string): Promise<string> {
  return await readFile(filePath, "utf-8");
}

// Helper function to get file content from build events (no file I/O)
export function getFileContentFromEvents(
  events: any[],
  fileType: "html" | "rsc",
  route?: string
): string[] {
  return events
    .filter(
      (e) =>
        e.type === "file.write.done" &&
        e.data.fileType === fileType &&
        (!route || e.data.route === route)
    )
    .map((e) => e.data.content)
    .filter(Boolean);
}

// Helper function to check if any file contains text (no file I/O)
export function anyFileContainsFromEvents(
  events: any[],
  text: string,
  fileType?: "html" | "rsc"
): boolean {
  const fileEvents = events.filter(
    (e) =>
      e.type === "file.write.done" &&
      (!fileType || e.data.fileType === fileType)
  );

  return fileEvents.some((event) => event.data.content.includes(text));
}

// Helper function to check if any file path contains text (no file I/O)
export function anyFilePathContainsFromEvents(
  events: any[],
  text: string
): boolean {
  const fileEvents = events.filter((e) => e.type === "file.write.done");

  return fileEvents.some(
    (event) =>
      event.data.path.includes(text) ||
      event.data.fileName.includes(text) ||
      event.data.route.includes(text)
  );
}

// Helper function to check if any file name contains text (no file I/O)
export function anyFileNameContainsFromEvents(
  events: any[],
  text: string
): boolean {
  const fileEvents = events.filter((e) => e.type === "file.write.done");

  return fileEvents.some((event) => event.data.fileName.includes(text));
}

// Legacy function for backward compatibility (deprecated - use anyFileContainsFromEvents instead)
export async function anyFileContains(
  files: string[],
  text: string
): Promise<boolean> {
  for (const file of files) {
    if (file.endsWith(".js") || file.endsWith(".ts") || file.endsWith(".tsx")) {
      try {
        const content = await readFileContent(file);
        if (content.includes(text)) {
          return true;
        }
      } catch (error) {
        // File might not exist or be accessible, skip it
        console.warn(`Warning: Could not read file ${file}:`, error);
      }
    }
  }
  return false;
}

// Helper function to find files by pattern (from file list)
export function findFilesByPattern(files: string[], pattern: string): string[] {
  return files.filter((f) => f.includes(pattern));
}

// Helper function to get file paths from build events (no file I/O)
export function getFilePathsFromEvents(
  events: any[],
  fileType?: "html" | "rsc"
): string[] {
  return events
    .filter(
      (e) =>
        e.type === "file.write.done" &&
        (!fileType || e.data.fileType === fileType)
    )
    .map((e) => e.data.path)
    .filter(Boolean);
}

// Helper function to get file names from build events (no file I/O)
export function getFileNamesFromEvents(
  events: any[],
  fileType?: "html" | "rsc"
): string[] {
  return events
    .filter(
      (e) =>
        e.type === "file.write.done" &&
        (!fileType || e.data.fileType === fileType)
    )
    .map((e) => e.data.fileName)
    .filter(Boolean);
}

// Helper functions for extracting content from events
export function getHtmlContentFromEvents(events: any[]): string[] {
  return events
    .filter((e) => e.type === "file.write.done" && e.data.fileType === "html")
    .map((e) => e.data.content)
    .filter(Boolean);
}

export function getRscContentFromEvents(events: any[]): string[] {
  return events
    .filter((e) => e.type === "file.write.done" && e.data.fileType === "rsc")
    .map((e) => e.data.content)
    .filter(Boolean);
}

export function checkBuildEventOrder(events: any[]): boolean {
  const eventTypes = events.map((e) => e.type);
  const hasStart = eventTypes.includes("build.start");
  const hasEnd = eventTypes.includes("build.ssg.end");
  return (
    hasStart &&
    hasEnd &&
    eventTypes.indexOf("build.start") < eventTypes.indexOf("build.ssg.end")
  );
}

export function getBuildStartEvent(events: any[]): any {
  return events.find((e) => e.type === "build.start");
}

export function validateRscStreamingFormat(content: string): boolean {
  // Check for RSC streaming format (entries starting with numbers)
  return /\d+:/m.test(content) && content.length > 0;
}
