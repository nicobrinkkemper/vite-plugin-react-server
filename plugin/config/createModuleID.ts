import type { ResolvedUserOptions } from "../types.js";
import { replaceExtension } from "./extMap.js";
import { getNodeEnv } from "./getNodeEnv.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { detectClientModule } from "react-server-loader/directives";
import { stripTrailingDotSegment } from "../helpers/inputNormalizer.js";
import type { ConfigEnv } from "vite";
import { sep, resolve, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { createRollupLikeHash } from "./createRollupLikeHash.js";

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
  // Hashing + moduleBase-stripping must track `isBuild`, NOT `mode`. The chunk
  // EMISSION side (resolveOptions' entryFile/chunkFile hash() + Rollup's
  // preserveModulesRoot) hashes and strips `src/` on EVERY build regardless of
  // mode, so the client-REFERENCE side (this fn, used by the transformer) must
  // do the same — otherwise a `vite build --mode development` (NODE_ENV=
  // development) emits hashed/src-stripped chunks but bakes unhashed/src-kept
  // refs into the RSC stream, and SSG fails with ERR_MODULE_NOT_FOUND.
  // The dependency optimizer is NOT a concern here: it runs under
  // command === "serve" (so isBuild === false) and only pre-bundles
  // node_modules — it never names a first-party `src/*.client.*` chunk.
  const shouldHash = isBuild;
  const isProd = mode === "production" || isBuild;
  const removeModuleBase =
    (isProd || isBuild) && !options.build.preserveModulesRoot;
  

  // Hash configuration
  const hashOption = build?.hash ?? DEFAULT_CONFIG.BUILD.hash;
  
  // Virtual pattern for excluding virtual modules from hashing
  const virtualPattern = autoDiscover?.virtualPattern ?? DEFAULT_CONFIG.AUTO_DISCOVER.virtualPattern;
  
  // A module is a client component (and therefore must get a hosted,
  // `moduleBasePath`-prefixed moduleID) when the unified `detectClientModule`
  // helper says so — filename `.client.[cm]?[jt]sx?$` OR a top-of-file
  // `"use client"` directive. The `isClientByDirective` override fast-paths
  // the build's transformer answer (computed with Rollup's JSX-aware
  // `this.parse`), so we don't re-parse here.
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
    detectClientModule({ source: sourceContent, moduleId: id });

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
        // `entryFile` → `normalizer(n.name)`, which collapses one trailing
        // ".segment" (`view/View.generated` → `view/View`) — so the moduleID
        // must collapse identically or the registered client reference points
        // at a chunk that was never emitted (ERR_MODULE_NOT_FOUND at SSG
        // render). Delegated to the normalizer's own rule instead of a local
        // copy so the two paths can't drift again.
        if (isClientByDirective) {
          const ext = transformedId.match(/\.[cm]?[jt]sx?$/)?.[0] ?? "";
          const noExt = ext
            ? transformedId.slice(0, -ext.length)
            : transformedId;
          transformedId = stripTrailingDotSegment(noExt) + ext;
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
    
    // Step 6: Apply extension mapping — BUILD ONLY.
    // In a build the browser can't import .tsx, so client components are mapped
    // to .js. In DEV, Vite transpiles .tsx on the fly, so mapping there gives
    // the client-reference id a phantom .js the dev module graph never has —
    // the import resolves to "<name>.client.js.tsx", which 404s on the second
    // HMR fetch and kills Fast Refresh after the first edit (bd-572). Keep the
    // real .tsx id in dev.
    const isClientComponent = isClientComponentId(
      id,
      sourceContent,
      isClientByDirective
    );
    if (isBuild) {
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

