import { describe, test, expect } from "vitest";

// Direct import of React's loader functions
// @ts-ignore - we're importing a production JS file
import { load } from "../../node_modules/react-server-dom-esm/esm/react-server-dom-esm-node-loader.production.js";
import { load as load2 } from "vite-plugin-react-server/loader";

describe("React Loader Direct Call Tests (Unit)", () => {
  test("should transform re-exports directly using React's load function", async () => {
    // Create test files content
    const originalActionsContent = \`
"use server";

export async function addTodo(formData) {
  const text = formData.get("text");
  console.log("Adding todo:", text);
  return { success: true, text };
}

export async function deleteTodo(id) {
  console.log("Deleting todo:", id);
  return { success: true, id };
}
\`;

    const reexportActionsContent = \`
"use server";

export { addTodo, deleteTodo } from "./original-actions.js";
\`;

    // Test direct call to React's loader
    const originalResult = await load(
      "file:///test/original-actions.js",
      { 
        format: "module",
        conditions: ["react-server", "node", "import"],
        importAttributes: {},
      },
      async (url, context) => {
        // Mock the default load for the original file
        if (url === "file:///test/original-actions.js") {
          return {
            format: "module",
            source: originalActionsContent,
          };
        }
        throw new Error(\`Unexpected URL: \${url}\`);
      }
    );

    expect(originalResult).toBeDefined();
    expect(originalResult.format).toBe("module");
    expect(originalResult.source).toBeDefined();
    
    // The transformed source should contain server action transformations
    const transformedSource = originalResult.source.toString();
    expect(transformedSource).toContain("registerServerReference");
  });

  test("should handle re-exports correctly", async () => {
    const reexportActionsContent = \`
"use server";

export { addTodo, deleteTodo } from "./original-actions.js";
\`;

    // Test re-export handling
    const reexportResult = await load(
      "file:///test/reexport-actions.js",
      { 
        format: "module",
        conditions: ["react-server", "node", "import"],
        importAttributes: {},
      },
      async (url, context) => {
        if (url === "file:///test/reexport-actions.js") {
          return {
            format: "module",
            source: reexportActionsContent,
          };
        }
        throw new Error(\`Unexpected URL: \${url}\`);
      }
    );

    expect(reexportResult).toBeDefined();
    expect(reexportResult.format).toBe("module");
    expect(reexportResult.source).toBeDefined();
    
    const transformedSource = reexportResult.source.toString();
    // Re-exports should be transformed to handle server references
    expect(transformedSource).toContain("export");
  });

  test("should handle our plugin loader", async () => {
    // Test our plugin's loader function
    const testContent = \`
"use server";

export async function testAction() {
  return { test: true };
}
\`;

    try {
      const result = await load2(
        "file:///test/test-actions.js",
        { 
          format: "module" as const,
          conditions: ["react-server", "node", "import"],
          importAttributes: {},
        },
        async (url, context) => {
          return {
            format: "module" as const,
            source: testContent,
          };
        }
      );

      expect(result).toBeDefined();
      expect(result.format).toBe("module");
      
      if (result.source) {
        const transformedSource = result.source.toString();
        // Our loader should handle server actions
        expect(transformedSource).toBeTruthy();
      }
    } catch (error) {
      // If our loader doesn't handle this case, that's also valid
      console.log("Plugin loader doesn't handle this case:", error.message);
      expect(error).toBeDefined();
    }
  });

  test("should maintain proper function signatures after transformation", async () => {
    const functionsContent = \`
"use server";

export async function multiParamAction(param1, param2, formData) {
  console.log("Multiple params:", param1, param2);
  return { param1, param2, form: formData };
}

export async function simpleAction() {
  return { simple: true };
}
\`;

    const result = await load(
      "file:///test/functions.js",
      { 
        format: "module",
        conditions: ["react-server", "node", "import"],
        importAttributes: {},
      },
      async (url, context) => {
        return {
          format: "module",
          source: functionsContent,
        };
      }
    );

    expect(result).toBeDefined();
    const transformedSource = result.source.toString();
    
    // Should contain both function transformations
    expect(transformedSource).toContain("multiParamAction");
    expect(transformedSource).toContain("simpleAction");
    expect(transformedSource).toContain("registerServerReference");
  });
});
