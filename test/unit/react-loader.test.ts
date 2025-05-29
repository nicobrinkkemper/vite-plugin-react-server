// test/unit/loader/loader.test.ts
import { transformModuleIfNeeded } from "../../plugin/loader/transformModuleIfNeeded";
import { handleExports } from "../../plugin/loader/handleExports";
import { parse } from "acorn";
import { describe, test, expect } from "vitest";
import { DEFAULT_CONFIG } from "../../plugin/config/defaults.js";
import { load } from "../../plugin/loader/react-loader.server.js";
import React from "react";
import { createDefaultLoader } from "../../plugin/loader/createDefaultLoader";

describe("Loader Core Functionality", () => {
  describe("transformModuleIfNeeded", () => {
    test("should not transform modules without directives", async () => {
      const source = `
        export function test() {
          return 42;
        }
      `;
      const result = transformModuleIfNeeded(
        source,
        "test.js",
        "test",
        null, // no directives
        null,
        true // isServerEnvironment
      );
      // esbuild transforms exports into a more explicit format
      expect(result).toBe(`
        export function test() {
          return 42;
        }
      `);
    });

    test("should transform server modules and preserve all exports", async () => {
      const source = `"use server";
export function add(a, b) {
  return a + b;
}

export function subtract(a, b) {
  return a - b;
}

export const multiply = (a, b) => a * b;

export class Calculator {
  divide(a, b) {
    return a / b;
  }
}`;
      const result = transformModuleIfNeeded(
        source,
        "test.js",
        "test",
        source.match(DEFAULT_CONFIG.AUTO_DISCOVER.serverDirective),
        null,
        true // isServerEnvironment
      );

      // Check that all exports are preserved and registered
      expect(result).toContain(
        'import { registerServerReference } from "react-server-dom-esm/server.node";'
      );
      expect(result).toContain(
        'registerServerReference(add, "test", "add");'
      );
      expect(result).toContain(
        'registerServerReference(subtract, "test", "subtract");'
      );
      expect(result).toContain(
        'registerServerReference(multiply, "test", "multiply");'
      );
      expect(result).toContain(
        'registerServerReference(Calculator, "test", "Calculator");'
      );

      // Verify function implementations are preserved
      expect(result).toContain("function add(a, b) {");
      expect(result).toContain("function subtract(a, b) {");
      expect(result).toContain("const multiply = (a, b) => a * b;");
      expect(result).toContain("class Calculator {");
    });

    test("should transform client modules and register all components", async () => {
      const source = `"use client";
export function Button(props) {
  return { type: 'button', props };
}

export function Input(props) {
  return { type: 'input', props };
}

export const Card = (props) => ({
  type: 'card',
  props
});

export class Modal {
  constructor(props) {
    this.props = props;
  }
}`;
      const result = transformModuleIfNeeded(
        source,
        "test.jsx",
        "test",
        null,
        source.match(DEFAULT_CONFIG.AUTO_DISCOVER.clientDirective),
        true // isServerEnvironment
      );

      // Check that all components are registered and exported
      expect(result).toContain(
        'import { registerClientReference } from "react-server-dom-esm/server.node";'
      );
      expect(result).toContain(
        "export const Button = registerClientReference(function() {"
      );
      expect(result).toContain(
        "export const Input = registerClientReference(function() {"
      );
      expect(result).toContain(
        "export const Card = registerClientReference(function() {"
      );
      expect(result).toContain(
        "export const Modal = registerClientReference(function() {"
      );

      // Verify error-throwing functions are registered
      expect(result).toContain(
        'throw new Error("Attempted to call Button() from the server but Button is on the client. It\'s not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");'
      );
    });

    test("should handle mixed exports in server modules", async () => {
      const source = `"use server";
export function serverAction() {
  return "server";
}

export const clientComponent = () => {
  return "client";
};

export const regularValue = 42;

export default function DefaultExport() {
  return "default";
}`;
      const result = transformModuleIfNeeded(
        source,
        "test.js",
        "test",
        source.match(DEFAULT_CONFIG.AUTO_DISCOVER.serverDirective),
        null,
        true // isServerEnvironment
      );

      // Check that all exports are preserved
      expect(result).toContain(
        'import { registerServerReference } from "react-server-dom-esm/server.node";'
      );
      expect(result).toContain(
        'registerServerReference(serverAction, "test", "serverAction");'
      );
      expect(result).toContain(
        'registerServerReference(clientComponent, "test", "clientComponent");'
      );
      expect(result).toContain(
        'registerServerReference(regularValue, "test", "regularValue");'
      );
      expect(result).toContain(
        'registerServerReference(DefaultExport, "test", "default");'
      );

      // Verify server function is registered
      expect(result).toContain("function serverAction() {");
    });

    test("should handle server actions with multiple async functions", async () => {
      const source = `"use server";
import { db } from "../db.server.js";

export async function getTodos() {
  // Implementation omitted
}

export async function addTodo(title) {
  // Implementation omitted
}

export async function toggleTodo(id) {
  // Implementation omitted
}

export async function deleteTodo(id) {
  // Implementation omitted
}

export async function editTodo(id, title) {
  // Implementation omitted
}

export async function clearCompletedTodos() {
  // Implementation omitted
}`;
      const result = transformModuleIfNeeded(
        source,
        "test.js",
        "test",
        source.match(DEFAULT_CONFIG.AUTO_DISCOVER.serverDirective),
        null,
        true // isServerEnvironment
      );

      // Check that all exports are preserved and registered
      expect(result).toContain(
        'import { registerServerReference } from "react-server-dom-esm/server.node";'
      );
      expect(result).toContain(
        'registerServerReference(getTodos, "test", "getTodos");'
      );
      expect(result).toContain(
        'registerServerReference(addTodo, "test", "addTodo");'
      );
      expect(result).toContain(
        'registerServerReference(toggleTodo, "test", "toggleTodo");'
      );
      expect(result).toContain(
        'registerServerReference(deleteTodo, "test", "deleteTodo");'
      );
      expect(result).toContain(
        'registerServerReference(editTodo, "test", "editTodo");'
      );
      expect(result).toContain(
        'registerServerReference(clearCompletedTodos, "test", "clearCompletedTodos");'
      );

      // Verify async functions are registered
      expect(result).toContain("async function getTodos() {");
      expect(result).toContain("async function addTodo(title) {");
      expect(result).toContain("async function toggleTodo(id) {");
    });
  });

  describe("handleExports", () => {
    test("should handle named exports", () => {
      const source = `
        export const value = 42;
        export function test() {}
      `;
      const program = parse(source, {
        sourceType: "module",
        ecmaVersion: "latest",
      });
      const result = handleExports(source, program, null, null);
      expect(result.exportNames).toContain("value");
      expect(result.exportNames).toContain("test");
    });

    test("should handle default exports", () => {
      const source = `
        export default function() {}
      `;
      const program = parse(source, {
        sourceType: "module",
        ecmaVersion: "latest",
      });
      const result = handleExports(source, program, null, null);
      expect(result.exportNames).toContain("default");
    });

    test("should handle server function exports", () => {
      const source = `
        "use server";
        export function test() {
          return 42;
        }
      `;
      const program = parse(source, {
        sourceType: "module",
        ecmaVersion: "latest",
      });
      const result = handleExports(
        source,
        program,
        source.match(DEFAULT_CONFIG.AUTO_DISCOVER.serverDirective),
        null
      );
      expect(result.exportNames).toContain("test");
      expect(
        result.declarations.some((d) => d.includes("function test()"))
      ).toBe(true);
    });

    test("should handle async function exports", () => {
      const source = `
        export async function test() {
          return 42;
        }
      `;
      const program = parse(source, {
        sourceType: "module",
        ecmaVersion: "latest",
      });
      const result = handleExports(source, program, null, null);
      expect(result.exportNames).toContain("test");
      expect(
        result.declarations.some((d) => d.includes("async function test()"))
      ).toBe(true);
    });

    test("should handle function expression exports", () => {
      const source = `
        export const test = function() {
          return 42;
        };
      `;
      const program = parse(source, {
        sourceType: "module",
        ecmaVersion: "latest",
      });
      const result = handleExports(source, program, null, null);
      expect(result.exportNames).toContain("test");
      const exportInfo = result.exports.get("test");
      expect(exportInfo).toBeDefined();
      expect(exportInfo?.type).toBe("function");
      expect(exportInfo?.declaration).toContain("function()");
    });

    test("should handle arrow function exports", () => {
      const source = `
        export const test = () => 42;
      `;
      const program = parse(source, {
        sourceType: "module",
        ecmaVersion: "latest",
      });
      const result = handleExports(source, program, null, null);
      expect(result.exportNames).toContain("test");
      const exportInfo = result.exports.get("test");
      expect(exportInfo).toBeDefined();
      expect(exportInfo?.type).toBe("function");
      expect(exportInfo?.declaration).toContain("=>");
    });

    test("should handle multiple exports in one statement", () => {
      const source = `
        export const a = 1, b = 2, c = 3;
      `;
      const program = parse(source, {
        sourceType: "module",
        ecmaVersion: "latest",
      });
      const result = handleExports(source, program, null, null);
      expect(result.exportNames).toContain("a");
      expect(result.exportNames).toContain("b");
      expect(result.exportNames).toContain("c");
    });

    test("should handle re-exports", () => {
      const source = `
        export { test } from './other';
      `;
      const program = parse(source, {
        sourceType: "module",
        ecmaVersion: "latest",
      });
      const result = handleExports(source, program, null, null);
      expect(result.exportNames).toContain("test");
    });

    test("should handle export all", () => {
      const source = `
        export * from './other';
      `;
      const program = parse(source, {
        sourceType: "module",
        ecmaVersion: "latest",
      });
      const result = handleExports(source, program, null, null);
      expect(result.exportNames).toContain("*");
    });
  });
});

describe("Source Map Handling", () => {
  test("should generate basic source map for files without one", async () => {
    const source = `"use server";
export function test() {
  return 42;
}`;
    const result = await load("test.js", {
      format: "module",
      conditions: ["react-server"],
      importAttributes: {},
      url: "test.js"
    }, createDefaultLoader(source));

    expect(result.map).toBeDefined();
    expect(result.map?.sources).toContain("test.js");
    expect(result.map?.sourcesContent).toContain(`import { registerServerReference } from "react-server-dom-esm/server.node";

"use server";
function test() {
  return 42;
}
export {
  test
};


registerServerReference(test, "test.js", "test");`);
    expect(result.map?.mappings).toBeDefined();
  });

  test("should preserve and extend existing source maps", async () => {
    const source = `"use server";
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlc3QudHMiXSwic291cmNlQ29udGVudCI6WyJleHBvcnQgZnVuY3Rpb24gdGVzdCgpIHsgcmV0dXJuIDQyOyB9Il0sIm1hcHBpbmdzIjoiQUFBQSJ9
export function test() {
  return 42;
}`;
    const result = await load("test.js", {
      format: "module",
      conditions: ["react-server"],
      importAttributes: {},
      url: "test.js"
    }, createDefaultLoader(source));

    expect(result.map).toBeDefined();
    expect(result.map?.sources).toContain("test.js");
    expect(result.map?.sourcesContent).toContain(`import { registerServerReference } from "react-server-dom-esm/server.node";

"use server";
function test() {
  return 42;
}
export {
  test
};


registerServerReference(test, "test.js", "test");`);
    expect(result.map?.mappings).toBeDefined();
  });

  test("should handle source maps with multiple lines", async () => {
    const source = `"use server";
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlc3QudHMiXSwic291cmNlQ29udGVudCI6WyJleHBvcnQgZnVuY3Rpb24gdGVzdCgpIHtcbiAgcmV0dXJuIDQyO1xufSJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQSJ9
export function test() {
  return 42;
}`;
    const result = await load("test.js", {
      format: "module",
      conditions: ["react-server"],
      importAttributes: {},
      url: "test.js"
    }, createDefaultLoader(source));

    expect(result.map).toBeDefined();
    expect(result.map?.mappings).toBeDefined();
  });

  test("should handle source maps for client components", async () => {
    const source = `"use client";
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlc3QudHMiXSwic291cmNlQ29udGVudCI6WyJleHBvcnQgZnVuY3Rpb24gdGVzdCgpIHsgcmV0dXJuIDQyOyB9Il0sIm1hcHBpbmdzIjoiQUFBQSJ9
export function test() {
  return 42;
}`;
    const result = await load("test.js", {
      format: "module",
      conditions: ["react-server"],
      importAttributes: {},
      url: "test.js"
    }, createDefaultLoader(source));

    expect(result.map).toBeDefined();
    expect(result.map?.sources).toContain("test.js");
    expect(result.map?.mappings).toBeDefined();
  });
});
