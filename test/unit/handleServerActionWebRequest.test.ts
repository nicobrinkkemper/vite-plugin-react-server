import { describe, it, expect, vi } from "vitest";
import { handleServerActionRequest } from "../../dist/plugin/helpers/handleServerAction.server.js";

// Web-standard server-action entry: (Request) => Promise<Response>. It shares the
// trust boundary (resolveAndExecuteServerAction) and the CSRF / body-cap guards
// with the Node handler, so these mirror handleServerActionHardening.test.ts but
// against the Fetch Request/Response envelope.

function webReq(id: string, body = "[]", headers: Record<string, string> = {}) {
  return new Request("https://example.test/__server-action", {
    method: "POST",
    headers: { "x-rsc-action": id, ...headers },
    body,
  });
}

const MANIFEST = {
  "src/server/actions.server.ts": {
    file: "assets/actions-abc.js",
    src: "src/server/actions.server.ts",
  },
};

describe("handleServerActionRequest (Web)", () => {
  describe("allowedOrigins (CSRF guard)", () => {
    it("rejects a request whose Origin is not in the allowlist (403), before resolving", async () => {
      const ssrLoadModule = vi.fn();
      const res = await handleServerActionRequest(
        webReq("src/server/actions.server.ts#addTodo", "[]", {
          origin: "https://evil.example",
        }),
        {
          projectRoot: "/proj",
          serverManifest: MANIFEST,
          serverRoot: "/proj/dist/server",
          allowedOrigins: ["https://app.example"],
          ssrLoadModule,
        }
      );
      expect(res.status).toBe(403);
      expect(ssrLoadModule).not.toHaveBeenCalled();
    });

    it("allows a request with an allowed Origin", async () => {
      const res = await handleServerActionRequest(
        webReq("forged.server.ts#pwn", "[]", { origin: "https://app.example" }),
        {
          projectRoot: "/proj",
          serverManifest: MANIFEST,
          serverRoot: "/proj/dist/server",
          allowedOrigins: ["https://app.example"],
        }
      );
      // Origin passed the guard; it fails later on the unknown id, not 403.
      expect(res.status).not.toBe(403);
    });

    it("allows a request with no Origin header (not a CSRF vector)", async () => {
      const res = await handleServerActionRequest(webReq("forged.server.ts#pwn"), {
        projectRoot: "/proj",
        serverManifest: MANIFEST,
        serverRoot: "/proj/dist/server",
        allowedOrigins: ["https://app.example"],
      });
      expect(res.status).not.toBe(403);
    });
  });

  describe("maxBodyBytes (DoS guard)", () => {
    it("rejects an oversized body with 413 without resolving the action", async () => {
      const ssrLoadModule = vi.fn();
      const big = JSON.stringify(["x".repeat(1000)]);
      const res = await handleServerActionRequest(
        webReq("src/server/actions.server.ts#addTodo", big),
        {
          projectRoot: "/proj",
          serverManifest: MANIFEST,
          serverRoot: "/proj/dist/server",
          maxBodyBytes: 16,
          ssrLoadModule,
        }
      );
      expect(res.status).toBe(413);
      expect(ssrLoadModule).not.toHaveBeenCalled();
    });

    it("allows a body within the limit", async () => {
      const res = await handleServerActionRequest(webReq("forged.server.ts#pwn", "[]"), {
        projectRoot: "/proj",
        serverManifest: MANIFEST,
        serverRoot: "/proj/dist/server",
        maxBodyBytes: 1024,
      });
      expect(res.status).not.toBe(413);
    });
  });

  describe("responses", () => {
    it("never includes a stack trace or file paths in the error response", async () => {
      const res = await handleServerActionRequest(webReq("forged.server.ts#pwn"), {
        projectRoot: "/proj",
        serverManifest: MANIFEST,
        serverRoot: "/proj/dist/server",
      });
      expect(res.status).toBe(500);
      const body = await res.text();
      expect(body).not.toContain("stack");
      expect(body).not.toMatch(/\.ts:\d+|\/proj\//);
    });

    it("returns the action result in RSC wire format on success", async () => {
      // devOpen path (not a trust boundary; used here to exercise the success
      // envelope end-to-end without a built module on disk).
      const ssrLoadModule = vi.fn(async () => ({
        addTodo: async (t: string) => ({ ok: t }),
      }));
      const res = await handleServerActionRequest(
        webReq("src/actions.ts#addTodo", JSON.stringify(["milk"])),
        { projectRoot: process.cwd(), devOpen: true, ssrLoadModule }
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/x-component");
      expect(await res.text()).toBe(`0:${JSON.stringify({ ok: "milk" })}\n`);
      expect(ssrLoadModule).toHaveBeenCalled();
    });
  });
});
