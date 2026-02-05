import { describe, it, expect } from "vitest";
import { requestInfo } from "../../plugin/helpers/requestInfo.js";
import { testUserOptions } from "../test-config.js";

describe("requestInfo", () => {
  it("treats POST with RSC accept as server action", () => {
    const info = requestInfo(
      {
        url: "/",
        method: "POST",
        headers: {
          accept: "text/x-component",
          "content-type": "application/json",
        },
      } as any,
      testUserOptions,
      "",
    );
    expect(info.isServerActionRequest).toBe(true);
    expect(info.isFormActionRequest).toBe(false);
  });

  it("treats form post navigation as form action", () => {
    const info = requestInfo(
      {
        url: "/",
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
        },
      } as any,
      testUserOptions,
      "",
    );
    expect(info.isFormActionRequest).toBe(true);
    expect(info.isServerActionRequest).toBe(false);
  });
});
