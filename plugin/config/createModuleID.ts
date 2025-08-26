import type { ResolvedUserOptions } from "../types.js";
import { replaceExtension } from "./extMap.js";
import { getNodeEnv } from "./getNodeEnv.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { ConfigEnv } from "vite";
import { sep, resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

export type ModuleIDKey =
  | "modulePattern"
  | "cssPattern"
  | "jsonPattern"
  | "htmlPattern"
  | "rscPattern"
  | "nodeOnly"
  | "cssModulePattern"
  | "vendorPattern"
  | "virtualPattern"
  | "dotFiles";

export const createDefaultModuleID = (
  options: Pick<
    ResolvedUserOptions,
    "moduleBase" | "moduleBasePath" | "autoDiscover" | "build" | "dev" | "moduleBaseURL" | "projectRoot"
  >,
  configEnv?: ConfigEnv,
  mode = getNodeEnv()
) => {
  console.log(`[createDefaultModuleID] Creating moduleID function with configEnv: ${configEnv?.command}, mode: ${mode}`);
  const { moduleBase, moduleBasePath, build, moduleBaseURL, projectRoot } = options;
  const assetsDir = build.assetsDir || DEFAULT_CONFIG.BUILD.assetsDir;
  const isBuild = configEnv?.command === "build";
  const isProd = mode === "production" || isBuild;
  const removeModuleBase =
    isProd || isBuild || options.build.preserveModulesRoot;

  // Hash configuration
  const hashOption = build?.hash ?? DEFAULT_CONFIG.BUILD.hash;
  
  // Client component pattern for hashing
  const clientPattern = /\.client\.[cm]?[jt]sx?$/;

  // Clean hash API that mimics Rollup's behavior
  const createRollupLikeHash = (content: string, hashCharacters: 'base36' | 'base64' | 'hex' = 'base36') => {
    const hash = createHash('sha1');
    hash.update(content);
    const fullHash = hash.digest('hex');
    
    // Apply the same character set logic as Rollup
    switch (hashCharacters) {
      case 'base36':
        // Convert hex to base36 (0-9, a-z)
        return parseInt(fullHash.substring(0, 8), 16).toString(36);
      case 'base64':
        // Convert to base64-like format (A-Z, a-z, 0-9, -, _)
        return Buffer.from(fullHash.substring(0, 8), 'hex').toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
      case 'hex':
      default:
        // Return hex format
        return fullHash.substring(0, 8);
    }
  };

  // Hash function for client components - same logic as resolveOptions.ts
  const hash = (input: string | null, _ssr: boolean, sourceContent?: string) => {
    if (!input) return "";
    if (new RegExp(/\.(node|d\.ts)$/).test(input)) {
      return input;
    }
    
    // Check if hashing is disabled
    if (hashOption === "false") {
      return input;
    }
    
    // Only hash client components - server files should not be hashed
    const isClientComponent = clientPattern.test(input);

    if (!isClientComponent) {
      return input;
    }
    
    // Always hash the source content for consistency across builds
    // This ensures the same hash is generated in transformer and build process
    let contentToHash: string;
    
    if (sourceContent) {
      // Use provided source content (preferred)
      contentToHash = sourceContent;
    } else {
      // Try to read source file content
      try {
        const sourcePath = resolve(projectRoot, input);
        if (existsSync(sourcePath)) {
          contentToHash = readFileSync(sourcePath, 'utf-8');
        } else {
          // Fallback to filename
          contentToHash = input;
        }
      } catch (error) {
        // Fallback to filename
        contentToHash = input;
      }
    }
    
    // Generate hash using Rollup-like algorithm
    const hashCharacters = typeof hashOption === 'object' && hashOption?.format === 'hex' ? 'hex' : 'base36';
    const contentHash = createRollupLikeHash(contentToHash, hashCharacters);
    
    // Apply naming logic
    const extensionIndex = input.lastIndexOf(".");
    if (extensionIndex !== -1) {
      const extension = input.slice(extensionIndex);
      const filename = input.slice(0, extensionIndex);
      return filename + "-" + contentHash + extension;
    } else {
      return input + "-" + contentHash;
    }
  };
  const staticClientDist = isBuild ? join(build?.outDir || "dist", build?.static || "static") : "";
  const ssrClientDist = isBuild ? join(build?.outDir || "dist", build?.client || "client") : "";
  const serverDist = isBuild ? join(build?.outDir || "dist", build?.server || "server") : "";
  const buildDirs = isBuild ? [serverDist, ssrClientDist, staticClientDist] : [];

  return (id: string, sourceContent?: string) => {
    console.log(`[createDefaultModuleID] Called with id: ${id}, configEnv: ${configEnv?.command}, mode: ${mode}`);
    
    // For transformer usage (when we're in build mode and processing server components),
    // we want to strip build directory prefixes to get relative paths
    // This ensures the RSC stream contains paths that can be resolved by the HTML transform
    if (isBuild) {
      // Strip build directory prefixes to get relative paths
      for (const buildDir of buildDirs) {
        if (id.startsWith(buildDir)) {
          const result = id.slice(buildDir.length);
          console.log(`[createDefaultModuleID:transformer] Stripping ${buildDir} from ${id} -> ${result}`);
          return result;
        }
      }
      // Check for double path issues (like dist/client//dist/server/)
      if (id.includes('//')) {
        console.log(`[createDefaultModuleID:transformer] Found double slash in path: ${id}`);
        // Try to fix double path issues by finding the last occurrence of dist/
        const lastDistIndex = id.lastIndexOf('dist/');
        if (lastDistIndex !== -1) {
          const result = id.slice(lastDistIndex);
          console.log(`[createDefaultModuleID:transformer] Fixed double path: ${id} -> ${result}`);
          return result;
        }
      }
      
      // For client components in build mode, transform source paths to built paths
      const isClientComponent = clientPattern.test(id);
      if (isClientComponent) {
        // Transform source path to built client path
        let transformedId = id;
        
        // Step 1: Remove moduleBase (typically "src/") from the beginning
        if (removeModuleBase && transformedId.startsWith(moduleBase + sep)) {
          transformedId = transformedId.slice(moduleBase.length + sep.length);
        }
        
        // Step 2: Apply extension mapping for build
        transformedId = replaceExtension(transformedId, {
          build: { extensionMap: build.extensionMap },
        });
        
        // Step 3: Apply hashing for client components
        transformedId = hash(transformedId, false, sourceContent);
        
        console.log(`[createDefaultModuleID:transformer] Client component transformation: ${id} -> ${transformedId}`);
        return transformedId;
      }
      
      console.log(`[createDefaultModuleID:transformer] No build dir prefix found for ${id}, returning as-is`);
      return id;
    }
    
    // Normal build path transformation (existing logic)
    console.log(`[createDefaultModuleID:normal] Processing ${id} (configEnv: ${configEnv?.command}, mode: ${mode})`);

    // Step 1: Handle assets directory paths - remove src from within assets path
    // Transform: assets/src/page/file.css -> assets/page/file.css
    if (id.startsWith(assetsDir + sep + moduleBase + sep)) {
      id = assetsDir + sep + id.slice((assetsDir + sep + moduleBase + sep).length);
    }
    
    // Step 2: Remove moduleBaseURL if present (for incoming IDs that already have base URL)
    if (moduleBaseURL && moduleBaseURL !== "/" && id.startsWith(moduleBaseURL)) {
      id = id.slice(moduleBaseURL.length);
    }
    
    // Step 3: Remove src after the moduleBasePath if present
    if (moduleBasePath && moduleBasePath !== "/" && id.startsWith(moduleBasePath + moduleBase)) {
      // slice inbetween the moduleBasePath and moduleBase
      id = moduleBasePath + id.slice((moduleBasePath + moduleBase).length);
    }
    
    // Step 4: Remove moduleBase (typically "src/") from the beginning
    if (removeModuleBase && id.startsWith(moduleBase + sep)) {
      id = id.slice(moduleBase.length + sep.length);
    }

    // Step 5: Ensure paths start with a moduleBasePath
    if (!id.startsWith(moduleBasePath)) {
      id = moduleBasePath + id;
    }
    
    // Step 6: Apply extension mapping for build
    if (isBuild) {
      id = replaceExtension(id, {
        build: { extensionMap: build.extensionMap },
      });
    }
    
    // Step 7: Ensure CSS files are placed in the assets directory
    if (isBuild && id.endsWith('.css') && !id.startsWith(assetsDir + sep)) {
      id = assetsDir + sep + id;
    }
    
    // Step 8: Apply hashing for client components
    id = hash(id, false, sourceContent);
    
    // For client components, ensure no leading slash to allow proper relative resolution
    const isClientComponent = clientPattern.test(id);
    if (isClientComponent && moduleBasePath === '') {
      return id; // No leading slash for client components
    }
    
    // Don't add leading slash for relative paths - this causes module resolution issues
    if (moduleBasePath === '') {
      return id; // Return as-is without leading slash
    }
    
    return `${moduleBasePath}${id}`;
  };
};

