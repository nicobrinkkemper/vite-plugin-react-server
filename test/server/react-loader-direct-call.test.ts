import { describe, test, expect } from "vitest";

// Direct import of React's loader functions
// @ts-ignore - we're importing a production JS file
import { load } from "../../node_modules/react-server-dom-esm/esm/react-server-dom-esm-node-loader.production.js";
import { load as load2 } from "vite-plugin-react-server/loader"
describe("React Loader Direct Call Tests", () => {
  test("should transform re-exports directly using React's load function", async () => {
    // Create test files content
    const originalActionsContent = `
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
`;

    const reexportActionsContent = `
"use server";

export { addTodo, deleteTodo } from "./original-actions.js";
`;

    const exportStarActionsContent = `
"use server";

export * from "./original-actions.js";
`;

    // Mock context and defaultLoad function
    const mockContext = {
      format: 'module' as const,
      conditions: ['react-server'],
      importAssertions: {},
      importAttributes: {},
    };

    const mockDefaultLoad = async (url: string, context: any) => {
      if (url === "file:///test/original-actions.js") {
        return {
          format: 'module' as const,
          source: originalActionsContent,
        };
      }
      if (url === "file:///test/actions.server.js") {
        return {
          format: 'module' as const,
          source: reexportActionsContent,
        };
      }
      if (url === "file:///test/export-star.server.js") {
        return {
          format: 'module' as const,
          source: exportStarActionsContent,
        };
      }
      throw new Error(`Unknown URL: ${url}`);
    };

    // Test React's load function directly
    //console.log("=== Testing original file ===");
    const originalResult = await load(
      "file:///test/original-actions.js",
      mockContext,
      mockDefaultLoad
    );
    //console.log("React Original result:", originalResult);

    // Test our plugin's load function
    const originalResult2 = await load2(
      "file:///test/original-actions.js",
      mockContext,
      mockDefaultLoad
    );
    //console.log("Our Plugin Original result:", originalResult2);

    // Test direct transformation of re-export file
    console.log("\n=== Testing re-export file ===");
    const reexportResult = await load(
      "file:///test/actions.server.js",
      mockContext,
      mockDefaultLoad
    );
    //console.log("React Re-export result:", reexportResult);

    const reexportResult2 = await load2(
      "file:///test/actions.server.js",
      mockContext,
      mockDefaultLoad
    );
    //console.log("Our Plugin Re-export result:", reexportResult2);

    // Test export * behavior
    //console.log("\n=== Testing export * file ===");
    const exportStarResult = await load(
      "file:///test/export-star.server.js",
      mockContext,
      mockDefaultLoad
    );
    //console.log("React Export * result:", exportStarResult);

    const exportStarResult2 = await load2(
      "file:///test/export-star.server.js",
      mockContext,
      mockDefaultLoad
    );
    //console.log("Our Plugin Export * result:", exportStarResult2);

    // Log the results for analysis
    // console.log("\n📋 COMPARISON ANALYSIS:");
    // console.log("=== Original file ===");
    // console.log("Input:", originalActionsContent.trim());
    // console.log("React Output:", originalResult.source);
    // console.log("Our Plugin Output:", typeof originalResult2.source === 'string' ? originalResult2.source : '[ArrayBuffer]');
    
    // console.log("\n=== Re-export file ===");
    // console.log("Input:", reexportActionsContent.trim());
    // console.log("React Output:", reexportResult.source);
    // console.log("Our Plugin Output:", typeof reexportResult2.source === 'string' ? reexportResult2.source : '[ArrayBuffer]');

    // console.log("\n=== Export * file ===");
    // console.log("Input:", exportStarActionsContent.trim());
    // console.log("React Output:", exportStarResult.source);
    // console.log("Our Plugin Output:", typeof exportStarResult2.source === 'string' ? exportStarResult2.source : '[ArrayBuffer]');

    // Test expectations based on React's actual behavior
    expect(originalResult.source).toContain("registerServerReference");
    expect(originalResult.source).toContain("addTodo");
    expect(originalResult.source).toContain("deleteTodo");
    expect(originalResult.source).toContain("file:///test/original-actions.js");
    
    expect(reexportResult.source).toContain("registerServerReference");
    expect(reexportResult.source).toContain("addTodo");
    expect(reexportResult.source).toContain("deleteTodo");
    expect(reexportResult.source).toContain("file:///test/actions.server.js");

    // Test export * behavior - let's see what React actually does
    // console.log("\n🔍 EXPORT * COMPARISON:");
    // console.log("React export * has registrations?", exportStarResult.source.includes("registerServerReference"));
    // console.log("Our Plugin export * has registrations?", 
    //   typeof exportStarResult2.source === 'string' ? exportStarResult2.source.includes("registerServerReference") : false);
    // console.log("React export * contains addTodo?", exportStarResult.source.includes("addTodo"));
    // console.log("Our Plugin export * contains addTodo?", 
    //   typeof exportStarResult2.source === 'string' ? exportStarResult2.source.includes("addTodo") : false);
    // console.log("React export * contains deleteTodo?", exportStarResult.source.includes("deleteTodo"));
    // console.log("Our Plugin export * contains deleteTodo?", 
    //   typeof exportStarResult2.source === 'string' ? exportStarResult2.source.includes("deleteTodo") : false);
  });
}); 