import { tryManifest } from "./tryManifest.js";

export async function resolveWorkerModule(
  moduleGraph: Set<string> | string[],
  options: {
    root: string,
    outDir: string,
    workerPath: string
  }
) {
  console.log('Resolving worker module:', {
    moduleGraph: Array.from(moduleGraph),
    options
  });

  // Try module graph first
  const workerModule = Array.from(moduleGraph).find(id => 
    id.includes(options.workerPath)
  );

  console.log('Found in module graph:', workerModule);

  if (workerModule) {
    return workerModule;
  }

  // Fallback to manifest
  const resolvedManifest = tryManifest({
    root: options.root,
    outDir: options.outDir,
    ssrManifest: false
  });

  console.log('Manifest result:', resolvedManifest);

  if (resolvedManifest.type === "error") {
    throw new Error(`Could not find worker path in module graph or manifest: ${options.workerPath}`);
  }

  return resolvedManifest.manifest[options.workerPath]?.file;
} 