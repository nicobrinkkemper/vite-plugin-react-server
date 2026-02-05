import { describe, it, expect } from "vitest";
import { getServerOrigin, resolvePublicOrigin } from "../../plugin/config/publicOrigin.js";

describe("publicOrigin helpers", () => {
  it("uses user option when provided", () => {
    const value = resolvePublicOrigin({
      userOption: "https://example.com",
      envPublicOrigin: "",
      command: "serve",
      isPreview: false,
      server: { port: 3000, host: "localhost" },
    });
    expect(value).toBe("https://example.com");
  });

  it("falls back to env when user option is empty", () => {
    const value = resolvePublicOrigin({
      userOption: "",
      envPublicOrigin: "https://env.example.com",
      command: "serve",
      isPreview: false,
      server: { port: 3000, host: "localhost" },
    });
    expect(value).toBe("https://env.example.com");
  });

  it("derives dev origin when serving and no overrides", () => {
    const value = resolvePublicOrigin({
      userOption: "",
      envPublicOrigin: "",
      command: "serve",
      isPreview: false,
      server: { port: 5173, host: "localhost" },
    });
    expect(value).toBe("http://localhost:5173");
  });

  it("returns empty for build when no overrides", () => {
    const value = resolvePublicOrigin({
      userOption: "",
      envPublicOrigin: "",
      command: "build",
      isPreview: false,
      server: { port: 5173, host: "localhost" },
    });
    expect(value).toBe("");
  });

  it("builds server origin with https", () => {
    expect(getServerOrigin({ https: true, host: "localhost", port: 4443 })).toBe(
      "https://localhost:4443"
    );
  });
});
