// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyRouteHead,
  readRouteHead,
} from "../../plugin/router/applyRouteHead.js";
import type { RouteHeadContribution } from "../../plugin/router/head.js";

const mountPayload = (head: RouteHeadContribution | string) => {
  const root = document.createElement("div");
  const template = document.createElement("template");
  template.setAttribute(
    "data-vprs-head",
    typeof head === "string" ? head : JSON.stringify(head),
  );
  root.appendChild(template);
  document.body.appendChild(root);
  return root;
};

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  document.title = "";
});

describe("readRouteHead", () => {
  it("parses the template payload", () => {
    const root = mountPayload({ title: "x" });
    expect(readRouteHead(root)).toEqual({ title: "x" });
  });

  it("returns null for absent or malformed payloads", () => {
    expect(readRouteHead(document.createElement("div"))).toBeNull();
    expect(readRouteHead(mountPayload("{not json"))).toBeNull();
  });
});

describe("applyRouteHead", () => {
  it("sets the document title", () => {
    applyRouteHead(mountPayload({ title: "Greeting ada" }));
    expect(document.title).toBe("Greeting ada");
  });

  it("creates a keyed meta and marks it managed", () => {
    applyRouteHead(
      mountPayload({ meta: [{ name: "description", content: "d1" }] }),
    );
    const tag = document.head.querySelector("meta[name=description]");
    expect(tag?.getAttribute("content")).toBe("d1");
    expect(tag?.hasAttribute("data-vprs-head-managed")).toBe(true);
  });

  it("updates an existing (prerendered) meta in place without managing it", () => {
    const prerendered = document.createElement("meta");
    prerendered.setAttribute("name", "description");
    prerendered.setAttribute("content", "old");
    document.head.appendChild(prerendered);

    applyRouteHead(
      mountPayload({ meta: [{ name: "description", content: "new" }] }),
    );
    const tags = document.head.querySelectorAll("meta[name=description]");
    expect(tags.length).toBe(1);
    expect(tags[0].getAttribute("content")).toBe("new");
    expect(tags[0].hasAttribute("data-vprs-head-managed")).toBe(false);
  });

  it("removes a managed meta the next route no longer contributes", () => {
    applyRouteHead(
      mountPayload({ meta: [{ property: "og:title", content: "a" }] }),
    );
    expect(document.head.querySelector("meta[property='og:title']")).not.toBeNull();

    document.body.innerHTML = "";
    applyRouteHead(mountPayload({ title: "next route" }));
    expect(document.head.querySelector("meta[property='og:title']")).toBeNull();
  });

  it("leaves the head alone when the tree carries no payload", () => {
    document.title = "untouched";
    applyRouteHead(document.createElement("div"));
    expect(document.title).toBe("untouched");
  });
});
