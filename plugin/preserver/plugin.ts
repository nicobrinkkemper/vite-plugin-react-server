import type { Node } from "estree";
import type { Plugin } from "vite";
import MagicString from "magic-string";
import type { StreamPluginOptions } from "../types.js";

const REACT_DIRECTIVES = new Set(["use client", "use server"]);

export function reactPreservePlugin(_options: StreamPluginOptions): Plugin {
  const meta: Record<string, Set<string>> = {};

  return {
    name: "vite-plugin-react-server:preserve-directives",
    enforce: 'post',

    transform: {
      order: 'post',  // Ensure this runs last in transform phase
      handler(code: string, id: string) {
        // Skip node_modules and vite files
        if (id.includes('node_modules') || id.includes('vite/dist')) {
          return null;
        }

        let ast: Node;
        try {
          ast = this.parse(code, {
            allowReturnOutsideFunction: true,
            jsx: true
          }) as Node;
        } catch (e) {
          console.warn(`[PreservePlugin] Failed to parse ${id}`, e);
          return null;
        }

        if (ast.type !== 'Program') {
          return null;
        }

        const magicString = new MagicString(code);
        let hasChanged = false;

        // Only look at top-level directives
        for (const node of ast.body) {
          if (node.type !== 'ExpressionStatement') {
            break;
          }

          let directive: string | null = null;
          if ('directive' in node) {
            directive = node.directive;
          } else if (
            node.expression.type === 'Literal' && 
            typeof node.expression.value === 'string' &&
            REACT_DIRECTIVES.has(node.expression.value)
          ) {
            directive = node.expression.value;
          }

          if (directive) {
            meta[id] ||= new Set<string>();
            meta[id].add(directive);
            
            if ('start' in node && 'end' in node) {
              magicString.remove(node.start as number, node.end as number);
              hasChanged = true;
            }
          }
        }

        if (!hasChanged) {
          return null;
        }

        return {
          code: magicString.toString(),
          map: magicString.generateMap({ hires: true }),
          meta: {
            directives: Array.from(meta[id] || [])
          }
        };
      }
    },

    renderChunk(code, chunk) {
      const chunkDirectives = new Set<string>();
      
      // Collect directives from all modules in chunk
      for (const id of chunk.moduleIds) {
        if (meta[id]) {
          meta[id].forEach(d => chunkDirectives.add(d));
        }
      }

      if (chunkDirectives.size) {
        const magicString = new MagicString(code);
        magicString.prepend(
          Array.from(chunkDirectives)
            .map(d => `"${d}";`)
            .join('\n') + '\n'
        );

        return {
          code: magicString.toString(),
          map: magicString.generateMap({ hires: true })
        };
      }

      return null;
    }
  };
}
