// test/unit/loader/loader.test.ts
import { transformModuleIfNeeded } from "../../plugin/loader/transformModuleIfNeeded";
import { handleExports } from "../../plugin/loader/handleExports";
import { parse } from "acorn";
import { describe, test, expect } from "vitest";
import { DEFAULT_CONFIG } from "../../plugin/config/defaults.js";
import { load } from "../../plugin/loader/react-loader.server.js";

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
        "test.ts",
        "test",
        null, // no directives
        null,
        true // isServerEnvironment
      );
      expect(result.source).toBe(source);
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
        "test.ts",
        "test",
        source.match(DEFAULT_CONFIG.AUTO_DISCOVER.serverDirective),
        null,
        true // isServerEnvironment
      );

      // Check that all exports are preserved and registered
      expect(result.source).toContain(
        'import { registerServerReference } from "react-server-dom-esm/server.node";'
      );
      expect(result.source).toContain(
        'registerServerReference(add, "test", "add");'
      );
      expect(result.source).toContain(
        'registerServerReference(subtract, "test", "subtract");'
      );
      expect(result.source).toContain(
        'registerServerReference(multiply, "test", "multiply");'
      );
      expect(result.source).toContain(
        'registerServerReference(Calculator, "test", "Calculator");'
      );

      // Verify function implementations are preserved
      expect(result.source).toContain("function add(a, b) {");
      expect(result.source).toContain("function subtract(a, b) {");
      expect(result.source).toContain("const multiply = (a, b) => a * b;");
      expect(result.source).toContain("class Calculator {");
    });

    test("should transform client modules and register all components", async () => {
      const source = `"use client";
export function Button({ children }) {
  return <button>{children}</button>;
}

export function Input({ type = "text" }) {
  return <input type={type} />;
}

export const Card = ({ title, children }) => (
  <div className="card">
    <h2>{title}</h2>
    {children}
  </div>
);

export class Modal extends React.Component {
  render() {
    return <div className="modal">{this.props.children}</div>;
  }
}`;
      const result = transformModuleIfNeeded(
        source,
        "test.tsx",
        "test",
        null,
        source.match(DEFAULT_CONFIG.AUTO_DISCOVER.clientDirective),
        true // isServerEnvironment
      );

      // Check that all components are registered and exported
      expect(result.source).toContain(
        'import { registerClientReference } from "react-server-dom-esm/server.node";'
      );
      expect(result.source).toContain(
        "export const Button = registerClientReference(function() {"
      );
      expect(result.source).toContain(
        "export const Input = registerClientReference(function() {"
      );
      expect(result.source).toContain(
        "export const Card = registerClientReference(function() {"
      );
      expect(result.source).toContain(
        "export const Modal = registerClientReference(function() {"
      );

      // Verify error-throwing functions are registered
      expect(result.source).toContain(
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
        "test.ts",
        "test",
        source.match(DEFAULT_CONFIG.AUTO_DISCOVER.serverDirective),
        null,
        true // isServerEnvironment
      );

      // Check that all exports are preserved
      expect(result.source).toContain(
        'import { registerServerReference } from "react-server-dom-esm/server.node";'
      );
      expect(result.source).toContain(
        'registerServerReference(serverAction, "test", "serverAction");'
      );
      expect(result.source).toContain(
        'registerServerReference(clientComponent, "test", "clientComponent");'
      );
      expect(result.source).toContain(
        'registerServerReference(regularValue, "test", "regularValue");'
      );
      expect(result.source).toContain(
        'registerServerReference(DefaultExport, "test", "default");'
      );

      // Verify server function is registered
      expect(result.source).toContain("function serverAction() {");
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
      expect(
        result.declarations.some((d) => d.includes("const test = function()"))
      ).toBe(true);
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
      expect(
        result.declarations.some((d) => d.includes("const test = () =>"))
      ).toBe(true);
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
    const result = await load("test.ts", {
      format: "module",
      conditions: ["react-server"],
      importAttributes: {},
      url: "test.ts"
    }, async (url, context) => ({
      format: "module",
      source
    }));

    expect(result.map).not.toBeNull();
    expect(result.map?.version).toBe(3);
    expect(result.map?.sources).toContain("test.ts");
    expect(result.map?.sourcesContent).toContain(source);
    expect(result.map?.mappings).toBeDefined();
  });

  test("should preserve and extend existing source maps", async () => {
    const source = `"use server";
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlc3QudHMiXSwic291cmNlQ29udGVudCI6WyJleHBvcnQgZnVuY3Rpb24gdGVzdCgpIHsgcmV0dXJuIDQyOyB9Il0sIm1hcHBpbmdzIjoiQUFBQSJ9
export function test() {
  return 42;
}`;
    const result = await load("test.ts", {
      format: "module",
      conditions: ["react-server"],
      importAttributes: {},
      url: "test.ts"
    }, async (url, context) => ({
      format: "module",
      source
    }));

    expect(result.map).not.toBeNull();
    expect(result.map?.version).toBe(3);
    expect(result.map?.sources).toContain("test.ts");
    expect(result.map?.mappings).toBeDefined();
  });

  test("should handle source maps with multiple lines", async () => {
    const source = `"use server";
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlc3QudHMiXSwic291cmNlQ29udGVudCI6WyJleHBvcnQgZnVuY3Rpb24gdGVzdCgpIHtcbiAgcmV0dXJuIDQyO1xufSJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQSJ9
export function test() {
  return 42;
}`;
    const result = await load("test.ts", {
      format: "module",
      conditions: ["react-server"],
      importAttributes: {},
      url: "test.ts"
    }, async (url, context) => ({
      format: "module",
      source
    }));

    expect(result.map).not.toBeNull();
    expect(result.map?.mappings).toBeDefined();
  });

  test("should handle source maps for client components", async () => {
    const source = `"use client";
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlc3QudHMiXSwic291cmNlQ29udGVudCI6WyJleHBvcnQgZnVuY3Rpb24gdGVzdCgpIHsgcmV0dXJuIDQyOyB9Il0sIm1hcHBpbmdzIjoiQUFBQSJ9
export function test() {
  return 42;
}`;
    const result = await load("test.ts", {
      format: "module",
      conditions: ["react-server"],
      importAttributes: {},
      url: "test.ts"
    }, async (url, context) => ({
      format: "module",
      source
    }));

    expect(result.map).not.toBeNull();
    expect(result.map?.version).toBe(3);
    expect(result.map?.sources).toContain("test.ts");
    expect(result.map?.mappings).toBeDefined();
  });
});
