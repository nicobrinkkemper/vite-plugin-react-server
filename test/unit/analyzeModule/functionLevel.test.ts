import { describe, it, expect } from "vitest";
import { analyzeModule } from "../../../plugin/loader/directives/analyzeModule.js";
import { testLoaderConfig } from "./testLoaderConfig.js";

describe("analyzeModule - function-level directives", () => {
  it("should detect function-level use server directive", async () => {
    const source = `async function test() {
  "use server";
  return 42;
}`;
    const result = await analyzeModule(source, "test.js", testLoaderConfig);
    expect(result.directiveInfo?.functionLevel).toHaveLength(1);
    expect(result.directiveInfo?.functionLevel[0]).toEqual({
      type: "server",
      name: "test",
      exportName: "test",
      range: [26, 38],
    });
  });

  it("should allow multiple function-level use server directives", async () => {
    const source = `async function test1() {
  "use server";
  return 42;
}

async function test2() {
  "use server";
  return 43;
}

async function test3() {
  "use server";
  return 44;
}

async function test4() {
  "use server";
  return 45;
}
  
export {test1, test2, test3, test4};
`;
    const result = await analyzeModule(source, "test.js", testLoaderConfig);
    expect(result.directiveInfo?.functionLevel).toHaveLength(4);
    expect(result.directiveInfo?.functionLevel[0].name).toBe("test1");
    expect(result.directiveInfo?.functionLevel[1].name).toBe("test2");
    expect(result.directiveInfo?.functionLevel[2].name).toBe("test3");
    expect(result.directiveInfo?.functionLevel[3].name).toBe("test4");
  });

  it("should allow function-level directives after file-level directive", async () => {
    const source = `"use server";

async function test() {
  "use server";
  return 42;
}`;
    const result = await analyzeModule(source, "test.js", testLoaderConfig);
    expect(result.directiveInfo?.fileLevel?.type).toBe("server");
    expect(result.directiveInfo?.functionLevel).toHaveLength(0);
  });

  it("should detect function-level directives in arrow functions", async () => {
    const source = `const test = async () => {
  "use server";
  return 42;
}`;
    const result = await analyzeModule(source, "test.js", testLoaderConfig);
    expect(result.directiveInfo?.functionLevel).toHaveLength(1);
    expect(result.directiveInfo?.functionLevel[0].name).toBe("anonymous");
  });

  it("should detect function-level directives in function expressions", async () => {
    const source = `const test = async function() {
  "use server";
  return 42;
}`;
    const result = await analyzeModule(source, "test.js", testLoaderConfig);
    expect(result.directiveInfo?.functionLevel).toHaveLength(1);
    expect(result.directiveInfo?.functionLevel[0].name).toBe("anonymous");
  });

  it("should detect only function-level directives and ignore non-function-level ones", async () => {
    const source = `export async function test1() {
      "use server";
      return 1;
    }

    export async function test2() {
      return 2;
    }

    export async function test3() {
      "use server";
      return 3;
    }
  `;
    const result = await analyzeModule(source, "test.js", testLoaderConfig);
    console.log(result);
    expect(result.directiveInfo?.functionLevel.length).toBe(2);
    expect(result.directiveInfo?.functionLevel[0]?.name).toBe("test1");
    expect(result.directiveInfo?.functionLevel[1]?.name).toBe("test3");
    expect(result.directiveInfo?.warnings).toHaveLength(0);
    expect(result.directiveInfo?.fileLevel).toBeNull();
  });

  it("should detect function-level directives const function declaration", async () => {
    const source = `export const test = async function() {
      "use server";
      return 42;
    }`;
    const result = await analyzeModule(source, "test.js", testLoaderConfig);
    expect(result.directiveInfo?.functionLevel).toHaveLength(1);
    expect(result.directiveInfo?.functionLevel[0].name).toBe("anonymous");
    expect(result.exports?.exports.get("test")?.type).toBe("function");
  });
});
