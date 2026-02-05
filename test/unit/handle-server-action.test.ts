import { describe, it, expect } from "vitest";
import {
  parseServerActionRequest,
  createServerActionResponse,
} from "../../plugin/helpers/handleServerAction.js";

describe("parseServerActionRequest", () => {
  it("parses direct args array format", () => {
    const result = parseServerActionRequest('[1, 2, 3]', "/api/action");
    expect(result.args).toEqual([1, 2, 3]);
    expect(result.id).toBe("/api/action");
  });

  it("parses object format with id and args", () => {
    const result = parseServerActionRequest(
      '{"id": "mod#fn", "args": ["hello"]}'
    );
    expect(result.id).toBe("mod#fn");
    expect(result.args).toEqual(["hello"]);
  });

  it("defaults args to empty array in object format", () => {
    const result = parseServerActionRequest('{"id": "mod#fn"}');
    expect(result.id).toBe("mod#fn");
    expect(result.args).toEqual([]);
  });

  it("uses empty string id when url is undefined for array format", () => {
    const result = parseServerActionRequest("[]");
    expect(result.id).toBe("");
    expect(result.args).toEqual([]);
  });

  it("strips query params from url in array format", () => {
    const result = parseServerActionRequest("[]", "/action?t=123");
    expect(result.id).toBe("/action");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseServerActionRequest("not json")).toThrow();
  });

  it("throws on unexpected format (string)", () => {
    expect(() => parseServerActionRequest('"just a string"')).toThrow(
      "Invalid server action request format"
    );
  });

  it("throws on unexpected format (number)", () => {
    expect(() => parseServerActionRequest("42")).toThrow(
      "Invalid server action request format"
    );
  });
});

describe("createServerActionResponse", () => {
  it("creates success response with result", () => {
    const response = createServerActionResponse({ count: 5 });
    expect(response.type).toBe("server-action-response");
    expect(response.returnValue).toEqual({ count: 5 });
  });

  it("creates error response", () => {
    const response = createServerActionResponse(undefined, "Something broke");
    expect(response.type).toBe("server-action-response");
    expect(response.returnValue).toEqual({
      success: false,
      error: "Something broke",
    });
  });

  it("creates success response with undefined result", () => {
    const response = createServerActionResponse(undefined);
    expect(response.type).toBe("server-action-response");
    expect(response.returnValue).toBeUndefined();
  });

  it("creates success response with null result", () => {
    const response = createServerActionResponse(null);
    expect(response.type).toBe("server-action-response");
    expect(response.returnValue).toBeNull();
  });
});
