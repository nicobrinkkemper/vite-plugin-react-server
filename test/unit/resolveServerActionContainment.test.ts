import { describe, it, expect } from "vitest";
import { resolveServerAction } from "../../dist/plugin/helpers/handleServerActionHelper.js";

// The server-action id is client-supplied (x-rsc-action header). resolveServerAction
// must never resolve a path outside the project root, or a crafted id could import
// and invoke an arbitrary module. See docs/server-actions.md.
const ROOT = "/proj";

describe("resolveServerAction containment", () => {
  it("resolves a legit in-tree action id", () => {
    const r = resolveServerAction("src/actions/todos.server.ts#addTodo", ROOT);
    expect(r.exportName).toBe("addTodo");
    expect(r.fullPath).toBe("/proj/src/actions/todos.server.ts");
  });

  it("strips a single leading slash", () => {
    const r = resolveServerAction("/src/a.server.ts#fn", ROOT);
    expect(r.fullPath).toBe("/proj/src/a.server.ts");
  });

  it("rejects ../ traversal", () => {
    expect(() => resolveServerAction("../../etc/passwd#x", ROOT)).toThrow(
      /outside the project root/
    );
  });

  it("rejects traversal that re-enters via ..", () => {
    expect(() => resolveServerAction("src/../../secret.server.ts#x", ROOT)).toThrow(
      /outside the project root/
    );
  });

  it("still requires the #export format", () => {
    expect(() => resolveServerAction("src/a.server.ts", ROOT)).toThrow(
      /Invalid server action ID format/
    );
  });
});
