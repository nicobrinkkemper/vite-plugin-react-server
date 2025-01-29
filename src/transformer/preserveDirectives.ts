import type { Node } from "estree";
import type { Plugin } from "rollup";
import { SourceMapGenerator } from "source-map";
import { DEFAULT_CONFIG } from "../options.js";
import type { Options } from "../types.js";

const REACT_DIRECTIVES = new Set(["use client", "use server", "use no-memo"]);

interface PreserveDirectiveMeta {
  directives: Record<string, Set<string>>;
}

export function preserveDirectives(options?: Pick<Options, "include">): Plugin {
  const meta: PreserveDirectiveMeta = {
    directives: {},
  };
  const fileRegex = options?.include ?? DEFAULT_CONFIG.FILE_REGEX;

  return {
    name: "react-preserve-directives",
    transform: {
      order: "post",
      handler(code, id) {
        if (!fileRegex.test(id)) {
          return null;
        }

        const ast = this.parse(code) as Node;
        if (ast.type !== "Program") {
          return null;
        }

        let hasDirectives = false;
        const directives = new Set<string>();

        // Look for directives at start of file
        for (const node of ast.body) {
          if (node.type !== "ExpressionStatement") {
            break;
          }

          if (
            node.expression.type === "Literal" &&
            typeof node.expression.value === "string" &&
            REACT_DIRECTIVES.has(node.expression.value)
          ) {
            directives.add(node.expression.value);
            hasDirectives = true;
          }
        }

        if (!hasDirectives) return null;

        meta.directives[id] = directives;

        // Generate source map
        const map = new SourceMapGenerator({
          file: id,
          sourceRoot: "",
        });
        map.setSourceContent(id, code);

        return {
          code,
          map: map.toString(),
          meta: { directives: Array.from(directives) },
        };
      },
    },

    renderChunk(code, chunk) {
      const moduleIds = chunk.moduleIds;
      const chunkDirectives = moduleIds
        .map((id) => meta.directives[id])
        .filter((dirs): dirs is Set<string> => !!dirs)
        .reduce((acc, dirs) => {
          dirs.forEach((d) => acc.add(d));
          return acc;
        }, new Set<string>());

      if (chunkDirectives.size) {
        const directiveCode = Array.from(chunkDirectives)
          .map((d) => `"${d}";`)
          .join("\n");
        return {
          code: `${directiveCode}\n${code}`,
        };
      }

      return null;
    },

    onLog(level, log) {
      if (log.code === "MODULE_LEVEL_DIRECTIVE" && level === "warn") {
        return false;
      }
      return this.warn(log);
    },
  };
}
