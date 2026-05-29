import type { ResolvedUserOptions } from "../types.js";
import { replaceExtension } from "./extMap.js";
import { getNodeEnv } from "./getNodeEnv.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { hasFileLevelClientDirective } from "../loader/directives/hasFileLevelClientDirective.js";
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
  const { moduleBase, moduleBasePath, build, moduleBaseURL, projectRoot, autoDiscover } = options;
  const assetsDir = build.assetsDir || DEFAULT_CONFIG.BUILD.assetsDir;
  const isBuild = configEnv?.command === "build";
  // CRITICAL: In development mode, NEVER hash, even if command is "build" (optimizer)
  const isDevelopment = mode === "development";
  const shouldHash = isBuild && !isDevelopment;
  const isProd = mode === "production" || isBuild;
  // CRITICAL: In development mode, NEVER remove moduleBase (src/), even if command is "build" (optimizer)
  const removeModuleBase =
    (isProd || isBuild) && !isDevelopment && !options.build.preserveModulesRoot;
  

  // Hash configuration
  const hashOption = build?.hash ?? DEFAULT_CONFIG.BUILD.hash;
  
  // Virtual pattern for excluding virtual modules from hashing
  const virtualPattern = autoDiscover?.virtualPattern ?? DEFAULT_CONFIG.AUTO_DISCOVER.virtualPattern;
  
  // Client component pattern for hashing (filename convention).
  const clientPattern = /\.client\.[cm]?[jt]sx?$/;

  // A module is a client component (and therefore must get a hosted,
  // `moduleBasePath`-prefixed moduleID) if ANY of:
  //   1. an explicit `isClientByDirective` override is passed (the transformer
  //      computes this with Rollup's JSX/TS-aware `this.parse`, which is the
  //      authoritative detection — see createTransformerPlugin),
  //   2. its filename matches the `.client.` convention, OR
  //   3. it declares a top-of-file `"use client"` directive that this function
  //      can detect on its own from `sourceContent`.
  //
  // The directive checks are robust (acorn + analyzeDirectives), never the
  // naive substring matcher. NOTE: this function's own acorn parser (case 3)
  // cannot parse raw TSX (JSX + TS types), so the transformer passes the
  // override (case 1) for the build path. Case 3 still covers already-parseable
  // sources and keeps the function correct when called standalone.
  //
  // This is what lets directive-only client modules (no `.client.` suffix,
  // e.g. node_modules libs that ship `"use client"`) be hosted in the static
  // build instead of throwing "Attempted to load a Client Module outside the
  // hosted root".
  const isClientComponentId = (
    id: string,
    sourceContent?: string,
    isClientByDirective?: boolean
  ) =>
    isClientByDirective === true ||
    clientPattern.test(id) ||
    hasFileLevelClientDirective(sourceContent);

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
  const hash = (
    input: string | null,
    _ssr: boolean,
    sourceContent?: string,
    isClientByDirective?: boolean
  ) => {
    if (!input) return "";
    if (new RegExp(/\.(node|d\.ts)$/).test(input)) {
      return input;
    }
    
    // CRITICAL: Never hash node_modules files - Vite/Rollup handles those
    if (input.includes("node_modules")) {
      return input;
    }
    
    // CRITICAL: Never hash virtual modules (_virtual or matching virtualPattern) - Vite handles those
    if (input.includes("_virtual") || (virtualPattern && virtualPattern.test(input))) {
      return input;
    }
    
    // Check if hashing is disabled
    if (hashOption === "false") {
      return input;
    }
    
    // Only hash client components - server files should not be hashed.
    // Recognize the `.client.` filename convention, a top-of-file
    // `"use client"` directive (when source content is available), or an
    // explicit directive override threaded from the transformer.
    const isClientComponent = isClientComponentId(
      input,
      sourceContent,
      isClientByDirective
    );

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

  return (
    id: string,
    sourceContent?: string,
    isClientByDirective?: boolean
  ) => {
    // For transformer usage (when we're in build mode and processing server components),
    // we want to strip build directory prefixes to get relative paths
    // This ensures the RSC stream contains paths that can be resolved by the HTML transform
    if (shouldHash) {
      // Strip build directory prefixes to get relative paths
      for (const buildDir of buildDirs) {
        if (id.startsWith(buildDir)) {
          const result = id.slice(buildDir.length);
          return result;
        }
      }
      // Check for double path issues (like dist/client//dist/server/)
      if (id.includes('//')) {
        // Try to fix double path issues by finding the last occurrence of dist/
        const lastDistIndex = id.lastIndexOf('dist/');
        if (lastDistIndex !== -1) {
          const result = id.slice(lastDistIndex);
          return result;
        }
      }
      
      // For client components in build mode, transform source paths to built paths.
      // Directive-detected client modules (no `.client.` suffix) are hosted too.
      const isClientComponent = isClientComponentId(
        id,
        sourceContent,
        isClientByDirective
      );
      if (isClientComponent) {
        // Transform source path to built client path
        let transformedId = id;
        
        // Step 1: Remove moduleBase (typically "src/") from the beginning
        if (removeModuleBase && transformedId.startsWith(moduleBase + sep)) {
          transformedId = transformedId.slice(moduleBase.length + sep.length);
        }

        // Step 1b: Match the build's entryFile name normalization for
        // DIRECTIVE-detected client modules. The emitted chunk name comes from
        // `entryFile` → `normalizer(n.name)`, which strips one trailing
        // ".segment" unless it's `.client`/`.server`. For a compound filename
        // like `view/View.generated.tsx` that collapses to `view/View`, but
        // this moduleID otherwise keeps `.generated` — so the registered client
        // reference (`view/View.generated-<hash>.js`) wouldn't match the emitted
        // chunk (`view/View-<hash>.js`) → ERR_MODULE_NOT_FOUND at SSG render.
        // `.client.`-named modules are unaffected (the normalizer preserves
        // that suffix, and so do we). Single-segment names have nothing to strip.
        if (isClientByDirective) {
          const noExt = transformedId.replace(/\.[cm]?[jt]sx?$/, "");
          if (!noExt.endsWith(".client") && !noExt.endsWith(".server")) {
            const lastDot = noExt.lastIndexOf(".");
            if (lastDot > noExt.lastIndexOf("/")) {
              transformedId =
                noExt.slice(0, lastDot) + transformedId.slice(noExt.length);
            }
          }
        }

        // Step 2: Apply extension mapping for build
        transformedId = replaceExtension(transformedId, {
          build: { extensionMap: build.extensionMap },
        });
        
        
        // Step 3: Apply hashing for client components
        transformedId = hash(transformedId, false, sourceContent, isClientByDirective);
        
        // Step 4: Ensure paths start with moduleBasePath
        if (moduleBasePath && !transformedId.startsWith(moduleBasePath)) {
          transformedId = moduleBasePath + transformedId;
        }
        
        return transformedId;
      }
      
      return id;
    }
    
    // Normal build path transformation (existing logic)

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

    // Step 5: Ensure paths start with moduleBasePath (avoid double-prefix)
    if (moduleBasePath && !id.startsWith(moduleBasePath)) {
      id = moduleBasePath + id;
    }
    
    // Step 6: Apply extension mapping
    // ALWAYS replace extensions for client components (browser can't import .tsx)
    // For other files, only replace in build mode.
    // Directive-detected client modules count as client components too.
    const isClientComponent = isClientComponentId(
      id,
      sourceContent,
      isClientByDirective
    );
    if (isBuild || isClientComponent) {
      id = replaceExtension(id, {
        build: { extensionMap: build.extensionMap },
      });
    }
    
    // Step 7: Ensure CSS files are placed in the assets directory
    if (isBuild && id.endsWith('.css') && !id.startsWith(assetsDir + sep)) {
      id = assetsDir + sep + id;
    }
    
    // Step 8: Apply hashing for client components (only in production builds, not dev)
    if (shouldHash) {
      id = hash(id, false, sourceContent, isClientByDirective);
    }
    
    // For client components, ensure no leading slash to allow proper relative resolution
    // (isClientComponent already defined in Step 6)
    if (isClientComponent && moduleBasePath === '') {
      return id; // No leading slash for client components
    }
    
    // Don't add leading slash for relative paths - this causes module resolution issues
    if (moduleBasePath === '') {
      return id; // Return as-is without leading slash
    }
    
    // id already has moduleBasePath from Step 5 — return as-is
    return id;
  };
};

