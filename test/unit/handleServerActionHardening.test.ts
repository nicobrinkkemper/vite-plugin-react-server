import { describe, it, expect, vi } from "vitest";
import { Readable, PassThrough } from "node:stream";
import { handleServerAction } from "../../dist/plugin/helpers/handleServerAction.server.js";

// Endpoint hardening on the production server-action path: the opt-in CSRF
// (allowedOrigins) and body-size (maxBodyBytes) guards, plus the rule that error
// responses never ship a stack trace to the client.

function mockReq(id: string, body = "[]", headers: Record<string, string> = {}) {
  const req = Readable.from([Buffer.from(body)]) as any;
  req.headers = { "x-rsc-action": id, ...headers };
  req.url = "/__server-action";
  return req;
}

function mockRes() {
  const res = new PassThrough() as any;
  res.statusCode = 200;
  res.setHeader = () => {};
  const chunks: Buffer[] = [];
  const origEnd = res.end.bind(res);
  res.end = (data?: unknown) => {
    if (data) chunks.push(Buffer.from(data as Buffer));
    return origEnd(data);
  };
  res.body = () => Buffer.concat(chunks).toString();
  return res as any;
}

const MANIFEST = {
  "src/server/actions.server.ts": {
    file: "assets/actions-abc.js",
    src: "src/server/actions.server.ts",
  },
};

describe("server-action endpoint hardening", () => {
  describe("allowedOrigins (CSRF guard)", () => {
    it("rejects a request whose Origin is not in the allowlist (403), before parsing", async () => {
      const ssrLoadModule = vi.fn();
      const res = mockRes();
      await handleServerAction(
        mockReq("src/server/actions.server.ts#addTodo", "[]", {
          origin: "https://evil.example",
        }),
        res,
        {
          projectRoot: "/proj",
          serverManifest: MANIFEST,
          serverRoot: "/proj/dist/server",
          allowedOrigins: ["https://app.example"],
          ssrLoadModule,
        }
      );
      expect(res.statusCode).toBe(403);
      expect(ssrLoadModule).not.toHaveBeenCalled();
    });

    it("allows a request with an allowed Origin", async () => {
      const res = mockRes();
      await handleServerAction(
        mockReq("forged.server.ts#pwn", "[]", { origin: "https://app.example" }),
        res,
        {
          projectRoot: "/proj",
          serverManifest: MANIFEST,
          serverRoot: "/proj/dist/server",
          allowedOrigins: ["https://app.example"],
        }
      );
      // Origin passed the guard; it fails later on the unknown id, not 403.
      expect(res.statusCode).not.toBe(403);
    });

    it("allows a request with no Origin header (not a CSRF vector)", async () => {
      const res = mockRes();
      await handleServerAction(mockReq("forged.server.ts#pwn"), res, {
        projectRoot: "/proj",
        serverManifest: MANIFEST,
        serverRoot: "/proj/dist/server",
        allowedOrigins: ["https://app.example"],
      });
      expect(res.statusCode).not.toBe(403);
    });
  });

  describe("maxBodyBytes (DoS guard)", () => {
    it("rejects an oversized body with 413 without resolving the action", async () => {
      const ssrLoadModule = vi.fn();
      const res = mockRes();
      const big = JSON.stringify(["x".repeat(1000)]);
      await handleServerAction(
        mockReq("src/server/actions.server.ts#addTodo", big),
        res,
        {
          projectRoot: "/proj",
          serverManifest: MANIFEST,
          serverRoot: "/proj/dist/server",
          maxBodyBytes: 16,
          ssrLoadModule,
        }
      );
      expect(res.statusCode).toBe(413);
      expect(ssrLoadModule).not.toHaveBeenCalled();
    });

    it("allows a body within the limit", async () => {
      const res = mockRes();
      await handleServerAction(
        mockReq("forged.server.ts#pwn", "[]"),
        res,
        {
          projectRoot: "/proj",
          serverManifest: MANIFEST,
          serverRoot: "/proj/dist/server",
          maxBodyBytes: 1024,
        }
      );
      // Under the cap → not a 413; fails later on the unknown id.
      expect(res.statusCode).not.toBe(413);
    });
  });

  describe("error responses", () => {
    it("never includes a stack trace in the client response", async () => {
      const res = mockRes();
      await handleServerAction(mockReq("forged.server.ts#pwn"), res, {
        projectRoot: "/proj",
        serverManifest: MANIFEST,
        serverRoot: "/proj/dist/server",
      });
      expect(res.statusCode).toBe(500);
      const body = res.body();
      expect(body).not.toContain("stack");
      expect(body).not.toMatch(/\.ts:\d+|\/proj\//); // no file paths / line refs
    });
  });
});
