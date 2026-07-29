// Client-side head sync for the file router. The compose step ships the
// matched route's merged head.ts contribution as an inert
// `<template data-vprs-head='{"title":…}'>` inside the rendered tree (raw
// hoistables can't ride the hydration flight — see createElementWithReact).
// After hydration and after each navigation the router calls this to read
// that template and apply the head imperatively.
//
// Scope: `title`, and `meta` entries keyed by `name`/`property` (found or
// created, created ones marked managed). `links` and unkeyed meta stay
// document-render-only — they're in the prerendered <head> for crawlers, and
// per-navigation updates to them rarely matter to a running client.

import type { RouteHeadContribution } from "./head.js";

const MANAGED_ATTR = "data-vprs-head-managed";

const attrSelectorValue = (value: string) =>
  value.replace(/["\\]/g, "\\$&");

/** Read the head payload from the rendered tree, or null when absent. */
export function readRouteHead(root: ParentNode): RouteHeadContribution | null {
  const el = root.querySelector("template[data-vprs-head]");
  const raw = el?.getAttribute("data-vprs-head");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Apply title + keyed meta from the current route's head payload. */
export function applyRouteHead(
  root: ParentNode,
  doc: Document = document,
): void {
  const head = readRouteHead(root);
  if (!head) return;

  if (typeof head.title === "string") {
    doc.title = head.title;
  }

  const seen = new Set<Element>();
  for (const m of head.meta ?? []) {
    const key = m["name"]
      ? (["name", m["name"]] as const)
      : m["property"]
        ? (["property", m["property"]] as const)
        : null;
    if (!key) continue;
    let tag = doc.head.querySelector(
      `meta[${key[0]}="${attrSelectorValue(key[1])}"]`,
    );
    if (!tag) {
      tag = doc.createElement("meta");
      tag.setAttribute(key[0], key[1]);
      tag.setAttribute(MANAGED_ATTR, "");
      doc.head.appendChild(tag);
    }
    for (const [k, v] of Object.entries(m)) tag.setAttribute(k, v);
    seen.add(tag);
  }

  // A managed meta the new route no longer contributes goes away; metas from
  // the prerendered document (unmanaged) are left alone.
  for (const stale of doc.head.querySelectorAll(`meta[${MANAGED_ATTR}]`)) {
    if (!seen.has(stale)) stale.remove();
  }
}
