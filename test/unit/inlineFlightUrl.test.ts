import { describe, expect, it } from "vitest";
import {
  flightRouteKey,
  inlineFlightMatches,
} from "../../plugin/utils/inlineFlightUrl.js";

describe("flightRouteKey", () => {
  it("normalizes a page url the way the fetch path is built", () => {
    expect(flightRouteKey("/about")).toEqual({ path: "/about/", search: "" });
    expect(flightRouteKey("/about/")).toEqual({ path: "/about/", search: "" });
    expect(flightRouteKey("/about/index.rsc")).toEqual({ path: "/about/", search: "" });
    expect(flightRouteKey("/about/index.html")).toEqual({ path: "/about/", search: "" });
    expect(flightRouteKey("/")).toEqual({ path: "/", search: "" });
    expect(flightRouteKey("")).toEqual({ path: "/", search: "" });
    expect(flightRouteKey("//about//team")).toEqual({ path: "/about/team/", search: "" });
  });

  it("drops origin and hash, keeps the search apart", () => {
    expect(flightRouteKey("https://example.com/level/?course=x#top")).toEqual({
      path: "/level/",
      search: "?course=x",
    });
    expect(flightRouteKey("/level?course=x")).toEqual({
      path: "/level/",
      search: "?course=x",
    });
  });

  it("strips the deploy base whether or not the url carries it", () => {
    expect(flightRouteKey("/app/about/", "/app/").path).toBe("/about/");
    expect(flightRouteKey("/about/", "/app/").path).toBe("/about/");
    expect(flightRouteKey("/app", "/app/").path).toBe("/");
    expect(flightRouteKey("/app/", "/app").path).toBe("/");
    // A sibling path that merely shares the prefix is not under the base.
    expect(flightRouteKey("/application/", "/app/").path).toBe("/application/");
  });

  it("compares percent-encoded and raw paths alike", () => {
    expect(flightRouteKey("/docs/ü/").path).toBe(flightRouteKey("/docs/%C3%BC/").path);
  });
});

describe("inlineFlightMatches", () => {
  it("matches the document's own route in any spelling", () => {
    expect(inlineFlightMatches("/about", "http://h/about/")).toBe(true);
    expect(inlineFlightMatches("/about/index.rsc", "http://h/about/")).toBe(true);
    expect(inlineFlightMatches("/about/", "http://h/app/about/", "/app/")).toBe(true);
    expect(inlineFlightMatches("/app/about", "http://h/app/about/", "/app/")).toBe(true);
    expect(inlineFlightMatches("/", "http://h/#frag")).toBe(true);
  });

  it("refuses another route", () => {
    // A page whose client asks for an inner url on first load.
    expect(inlineFlightMatches("/projects/", "http://h/stage/projects/")).toBe(false);
    expect(inlineFlightMatches("/about/", "http://h/")).toBe(false);
    expect(inlineFlightMatches("/", "http://h/about/")).toBe(false);
  });

  it("compares the search only when the fetch names one", () => {
    expect(inlineFlightMatches("/level/", "http://h/level/?course=x")).toBe(true);
    expect(inlineFlightMatches("/level/?course=x", "http://h/level/?course=x")).toBe(true);
    expect(inlineFlightMatches("/level/?course=y", "http://h/level/?course=x")).toBe(false);
    expect(inlineFlightMatches("/level/?course=y", "http://h/level/")).toBe(false);
  });

  it("keeps the payload when the document url can't be told", () => {
    expect(inlineFlightMatches("/anything/", undefined)).toBe(true);
  });
});
