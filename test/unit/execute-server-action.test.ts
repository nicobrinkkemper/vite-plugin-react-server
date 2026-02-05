import { describe, it, expect } from "vitest";
import {
  resolveServerAction,
  executeServerAction,
} from "../../plugin/helpers/executeServerAction.js";

describe("resolveServerAction", () => {
  const params = {
    projectRoot: "/project",
    moduleBasePath: "/src/",
  };

  it("splits id into file path and export name", () => {
    const result = resolveServerAction("src/actions.ts#add", params);
    expect(result.exportName).toBe("add");
    // "src/actions.ts" doesn't start with moduleBasePath "/src/", so it's kept as-is
    expect(result.fullPath).toBe("/project/src/actions.ts");
  });

  it("strips moduleBasePath prefix from file path", () => {
    const result = resolveServerAction("/src/page/actions.ts#submit", params);
    expect(result.fullPath).toBe("/project/page/actions.ts");
  });

  it("handles paths without moduleBasePath prefix", () => {
    const result = resolveServerAction("lib/utils.ts#helper", params);
    expect(result.fullPath).toBe("/project/lib/utils.ts");
  });

  it("throws on missing hash separator", () => {
    expect(() => resolveServerAction("no-hash", params)).toThrow(
      "Invalid server action ID format"
    );
  });

  it("throws on empty export name", () => {
    expect(() => resolveServerAction("file.ts#", params)).toThrow(
      "Invalid server action ID format"
    );
  });

  it("throws on empty file path", () => {
    expect(() => resolveServerAction("#exportName", params)).toThrow(
      "Invalid server action ID format"
    );
  });

  it("handles empty moduleBasePath", () => {
    const result = resolveServerAction("src/actions.ts#run", {
      projectRoot: "/app",
      moduleBasePath: "/",
    });
    expect(result.fullPath).toBe("/app/src/actions.ts");
  });
});

describe("executeServerAction", () => {
  it("calls the exported function with args", async () => {
    const result = await executeServerAction("mod.ts#add", [2, 3], {
      projectRoot: "/test",
      moduleBasePath: "/",
      loader: async () => ({
        add: (a: number, b: number) => a + b,
      }),
    });
    expect(result).toBe(5);
  });

  it("throws when export is not a function", async () => {
    await expect(
      executeServerAction("mod.ts#value", [], {
        projectRoot: "/test",
        moduleBasePath: "/",
        loader: async () => ({ value: 42 }),
      })
    ).rejects.toThrow("Server action not found");
  });

  it("throws when export does not exist", async () => {
    await expect(
      executeServerAction("mod.ts#missing", [], {
        projectRoot: "/test",
        moduleBasePath: "/",
        loader: async () => ({}),
      })
    ).rejects.toThrow("Server action not found");
  });

  it("propagates loader errors", async () => {
    await expect(
      executeServerAction("mod.ts#fn", [], {
        projectRoot: "/test",
        moduleBasePath: "/",
        loader: async () => {
          throw new Error("Module not found");
        },
      })
    ).rejects.toThrow("Module not found");
  });

  it("passes async function results through", async () => {
    const result = await executeServerAction("mod.ts#fetch", ["url"], {
      projectRoot: "/test",
      moduleBasePath: "/",
      loader: async () => ({
        fetch: async (url: string) => ({ data: url }),
      }),
    });
    expect(result).toEqual({ data: "url" });
  });
});
