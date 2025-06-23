import { analyzeModule } from "../../../dist/plugin/loader/directives/analyzeModule.js";
import { describe, it, expect } from "vitest";

describe("analyzeModule - file-level directive warnings", () => {
  it("should warn about multiple file-level directives", async () => {
    const source = `"use client";
"use server";`;
    const result = await analyzeModule(source);
    expect(result.directiveInfo?.fileLevel?.type).toBe("client");
    expect(result.directiveInfo?.warnings).toEqual([
      {
        message: "Cannot have both 'use client' and 'use server' directives in the same file",
        range: [0, 0],
        type: "server"
      }
    ]);
  });

  it("should warn about mixed server/client file-level directives", async () => {
    const source = `"use client";
"use server";`;
    const result = await analyzeModule(source);
    expect(result.directiveInfo?.fileLevel?.type).toBe("client");
    expect(result.directiveInfo?.warnings).toEqual([
      {
        message: "Cannot have both 'use client' and 'use server' directives in the same file",
        range: [0, 0],
        type: "server"
      }
    ]);
  });

  it("should warn about file-level directive after code", async () => {
    const source = `const x = 1;
"use server";`;
    const result = await analyzeModule(source);
    expect(result.directiveInfo?.fileLevel?.type).toBe("server");
    expect(result.directiveInfo?.warnings).toEqual([
      {
        message: "File-level directives must be at the top of the file, before any other code",
        range: [13, 26],
        type: "server"
      }
    ]);
  });

  it("should warn about file-level directive after comments", async () => {
    const source = `// This is a comment
/* Another comment */
"use server";`;
    const result = await analyzeModule(source);
    expect(result.directiveInfo?.fileLevel?.type).toBe("server");
    expect(result.directiveInfo?.warnings).toEqual([
      {
        message: "File-level directives must be at the top of the file, before any other code",
        range: [43, 56],
        type: "server"
      }
    ]);
  });
}); 