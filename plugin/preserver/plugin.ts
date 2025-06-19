import type { Node } from "estree";
import type {
  InlineCssOpt,
  PagePropOpt,
  StreamPluginOptions,
} from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { basename } from "path";
import type { Plugin } from "vite";
import { resolveRegExp } from "../config/resolveRegExp.js";


function createSourceMap(id: string, code: string, mappings: string) {
  return {
    version: 3,
    file: basename(id),
    sources: [id],
    sourcesContent: [code],
    names: [],
    mappings,
    sourceRoot: "",
  };
}

function countLines(str: string): number {
  return str.split("\n").length;
}

function removeRanges(
  code: string,
  ranges: Array<{ start: number; end: number }>
) {
  // Sort ranges in reverse order to not affect positions
  ranges.sort((a, b) => b.start - a.start);

  let result = code;
  for (const range of ranges) {
    result = result.slice(0, range.start) + result.slice(range.end);
  }
  return result;
}

export function reactPreservePlugin<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(options: StreamPluginOptions<T, InlineCSS>): Plugin {
  const meta: Record<string, Set<string>> = {};
  // saves us from transforming all the options
  const moduleExtension = resolveRegExp(options.autoDiscover?.modulePattern, DEFAULT_CONFIG.AUTO_DISCOVER.modulePattern);
  const vendorPattern = resolveRegExp(options.autoDiscover?.vendorPattern, DEFAULT_CONFIG.AUTO_DISCOVER.vendorPattern);
  const virtualPattern = resolveRegExp(options.autoDiscover?.virtualPattern, DEFAULT_CONFIG.AUTO_DISCOVER.virtualPattern);
  const preserveDirectives = options.build?.preserveDirectives ?? DEFAULT_CONFIG.BUILD.preserveDirectives;

  return {
    name: "vite-plugin-react-server:preserve-directives",
    enforce: "post",

    transform: {
      order: "post", // Ensure this runs last in transform phase
      handler(code: string, id: string) {
        // we need to preserve the directives, because other wise the plugin chain won't
        // know about it.

        // Skip node_modules and vite files
        if (
          vendorPattern.test(id) ||
          virtualPattern.test(id) ||
          !moduleExtension.test(id)
        ) {
          return null;
        }

        let ast: Node;
        try {
          ast = this.parse(code, {
            allowReturnOutsideFunction: true,
            jsx: true,
          }) as Node;
        } catch (e) {
          console.warn(`[PreservePlugin] Failed to parse ${id}`, e);
          return null;
        }

        if (ast.type !== "Program") {
          return null;
        }

        const rangesToRemove: Array<{ start: number; end: number }> = [];
        let hasChanged = false;
        let mappings = "AAAA"; // Initial mapping for first line

        // Only look at top-level directives
        for (const node of ast.body) {
          if (node.type !== "ExpressionStatement") {
            break;
          }

          let directive: string | null = null;
          if ("directive" in node) {
            directive = node.directive;
          } else if (
            node.expression.type === "Literal" &&
            typeof node.expression.value === "string" &&
            DEFAULT_CONFIG.REACT_DIRECTIVES.has(node.expression.value)
          ) {
            directive = node.expression.value;
          }

          if (directive && "start" in node && "end" in node) {
            meta[id] ||= new Set<string>();
            meta[id].add(directive);
            rangesToRemove.push({
              start: node.start as number,
              end: node.end as number,
            });
            hasChanged = true;

            // Add mapping for each line removed
            const removedLines =
              code.slice(node.start as number, node.end as number).split("\n")
                .length - 1;
            for (let i = 0; i < removedLines; i++) {
              mappings += ";AACA";
            }
          }
        }

        if (!hasChanged) {
          return null;
        }

        const newCode = removeRanges(code, rangesToRemove);
        const sourceMap = createSourceMap(id, code, mappings);

        return {
          code: newCode,
          map: sourceMap,
          meta: {
            directives: Array.from(meta[id] || []),
          },
        };
      }
    },

    renderChunk(code, chunk) {
      // Skip if directives should not be preserved
      if (!preserveDirectives) {
        return null;
      }

      const chunkDirectives = new Set<string>();

      // Collect directives from all modules in chunk
      for (const id of chunk.moduleIds) {
        if (meta[id]) {
          meta[id].forEach((d) => chunkDirectives.add(d));
        }
      }

      if (chunkDirectives.size) {
        const directivesCode =
          Array.from(chunkDirectives)
            .map((d) => `"${d}";`)
            .join("\n") + "\n";

        const newCode = directivesCode + code;
        // Create source map for the prepended directives
        const lineCount = countLines(directivesCode);
        const mappings = "AAAA" + ";AACA".repeat(lineCount - 1);
        const sourceMap = createSourceMap(chunk.fileName, code, mappings);

        return {
          code: newCode,
          map: sourceMap,
        };
      }

      return null;
    }
  };
}
