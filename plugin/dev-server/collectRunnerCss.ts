import type {
  EnvironmentModuleGraph,
  EnvironmentModuleNode,
  ModuleNode,
  ViteDevServer,
  Logger,
} from "vite";

export const CSS_EXT = /\.(css|scss|sass|less|styl|stylus|pcss|postcss)(\?|$)/;

export type CollectedCss = { id: string; code: string };

/**
 * Walks the Vite server environment's module graph from `pagePath` and
 * returns the raw CSS code of every CSS module reachable from it.
 *
 * Replaces the rsc-worker's Node ESM CSS loader for runner mode: the
 * runner bypasses Node's import resolver, so the loader never fires.
 * The main thread has visibility into the same module graph and can
 * collect CSS deterministically once `runner.import(pagePath)` has
 * caused Vite to transform the page and its deps.
 */
export async function collectRunnerCss(
  server: ViteDevServer,
  pagePath: string,
  projectRoot: string,
  logger: Logger,
  verbose = false,
  // `route.tsx` layouts resolve from a separate module graph than the page, so
  // their CSS (a per-theme stylesheet, say) is collected only if we also seed
  // the walk with each layout module. Mirrors the server-env path in
  // collectViteModuleGraphCss.
  layoutPaths: string[] = []
): Promise<CollectedCss[]> {
  const env = server.environments?.["server"];
  if (!env) {
    if (verbose) logger.warn(`[collectRunnerCss] no server environment`);
    return [];
  }

  const moduleGraph: EnvironmentModuleGraph = env.moduleGraph;

  // Resolve a module by path, trying the URL schemes Vite's server graph uses,
  // then a suffix scan of idToModuleMap (keyed by absolute path + optional query).
  const resolveModule = async (
    p: string
  ): Promise<EnvironmentModuleNode | ModuleNode | undefined> => {
    const candidates = [
      p,
      p.startsWith("/") ? p : `/${p}`,
      p.startsWith(projectRoot) ? p : `${projectRoot}/${p}`,
    ];
    for (const url of candidates) {
      const m = await moduleGraph.getModuleByUrl(url);
      if (m) return m;
    }
    const idMap = (moduleGraph as any).idToModuleMap as
      | Map<string, EnvironmentModuleNode>
      | undefined;
    if (idMap) {
      for (const [id, node] of idMap.entries()) {
        if (id.endsWith(p) || id.endsWith(`/${p}`)) return node;
      }
    }
    return undefined;
  };

  const pageModule = await resolveModule(pagePath);
  if (!pageModule) {
    if (verbose) {
      logger.warn(
        `[collectRunnerCss] no module for pagePath: ${pagePath} (graph size: ${
          (moduleGraph as any).idToModuleMap?.size ?? "?"
        })`
      );
    }
    return [];
  }
  if (verbose) {
    logger.info(`[collectRunnerCss] resolved page module: ${pageModule.id}`);
  }

  const layoutModules = (
    await Promise.all(layoutPaths.map((p) => resolveModule(p)))
  ).filter((m): m is EnvironmentModuleNode | ModuleNode => m != null);

  const seen = new Set<string>();
  const out: CollectedCss[] = [];

  const walk = async (mod: EnvironmentModuleNode | ModuleNode) => {
    if (!mod?.id || seen.has(mod.id)) return;
    seen.add(mod.id);

    if (CSS_EXT.test(mod.id)) {
      try {
        const transformed = await env.transformRequest(`${mod.id}?inline`);
        if (transformed?.code) {
          const code = transformed.code;
          // Vite transforms `.css?inline` modules with different framings:
          // - SSR runner output: `const __vite_ssr_export_default__ = "...";`
          // - plain ESM output:  `export default "...";`
          // - legacy module API: `__vite__cssModules.default = "...";`
          const exportMatch =
            code.match(/__vite_ssr_export_default__\s*=\s*("(?:\\.|[^"\\])*")/) ??
            code.match(/export\s+default\s+("(?:\\.|[^"\\])*")/) ??
            code.match(/__vite__cssModules\.default\s*=\s*("(?:\\.|[^"\\])*")/);
          if (exportMatch) {
            const raw = JSON.parse(exportMatch[1]);
            if (typeof raw === "string" && raw.length > 0) {
              out.push({ id: mod.id, code: raw });
            } else if (verbose) {
              logger.warn(`[collectRunnerCss] inline default empty for ${mod.id}`);
            }
          } else if (verbose) {
            logger.warn(
              `[collectRunnerCss] could not find inline export in transform for ${mod.id} (codeLen=${code.length})`
            );
          }
        } else if (verbose) {
          logger.warn(`[collectRunnerCss] no transformed code for ${mod.id}?inline`);
        }
      } catch (err) {
        if (verbose) {
          logger.warn(
            `[collectRunnerCss] failed to inline ${mod.id}: ${String(err)}`
          );
        }
      }
    }

    if (mod.importedModules) {
      for (const imported of mod.importedModules as Iterable<
        EnvironmentModuleNode | ModuleNode
      >) {
        if (imported && typeof imported === "object" && "id" in imported) {
          await walk(imported);
        }
      }
    }
  };

  await walk(pageModule);
  for (const mod of layoutModules) {
    await walk(mod);
  }

  if (verbose) {
    logger.info(
      `[collectRunnerCss] collected ${out.length} CSS file(s) for ${pagePath}`
    );
  }
  return out;
}
