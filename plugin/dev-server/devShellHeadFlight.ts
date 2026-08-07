import type { HtmlTagDescriptor } from "vite";

/**
 * Head extraction straight from a FLIGHT payload — the dev-shell render needs
 * only the document's <head>, and in flight the Html component's head is
 * plain element rows. Reading them here means the shell render is served by
 * the existing dev rsc worker alone: no client React, no html worker in dev.
 *
 * Same whitelist and rationale as devShellHead.ts (title/meta/link/style;
 * scripts excluded). React prop names are mapped to their HTML attribute
 * form, since descriptors are serialized into the served index.html.
 *
 * The walker is deliberately conservative: it only descends plain JSON
 * (arrays, objects, element tuples). Reference placeholders ("$L1", "$@2" …)
 * are opaque without a full flight client, so a head that hides behind one is
 * treated as absent — the caller falls back to serving index.html unchanged.
 */

type FlightElement = [string, string, unknown, Record<string, unknown>];

const HEAD_TAGS = new Set(["title", "meta", "link", "style"]);

const ATTR_NAME: Record<string, string> = {
  className: "class",
  charSet: "charset",
  httpEquiv: "http-equiv",
  htmlFor: "for",
};

function isElement(node: unknown): node is FlightElement {
  return (
    Array.isArray(node) &&
    node.length === 4 &&
    node[0] === "$" &&
    typeof node[1] === "string" &&
    node[3] !== null &&
    typeof node[3] === "object"
  );
}

function toDescriptor(el: FlightElement): HtmlTagDescriptor {
  const [, tag, , props] = el;
  const attrs: Record<string, string | boolean> = {};
  let children: string | undefined;
  for (const [key, value] of Object.entries(props)) {
    if (key === "children") {
      if (typeof value === "string") children = value;
      else if (Array.isArray(value) && value.every((v) => typeof v === "string"))
        children = value.join("");
      continue;
    }
    if (value == null || typeof value === "object") continue;
    if (typeof value === "boolean") {
      if (value) attrs[ATTR_NAME[key] ?? key] = true;
      continue;
    }
    attrs[ATTR_NAME[key] ?? key] = String(value);
  }
  const descriptor: HtmlTagDescriptor = {
    tag: tag.toLowerCase(),
    attrs,
    injectTo: "head",
  };
  if (children !== undefined) descriptor.children = children;
  return descriptor;
}

function findHead(node: unknown, depth = 0): FlightElement | null {
  if (depth > 40 || node == null || typeof node !== "object") return null;
  if (isElement(node)) {
    if (node[1].toLowerCase() === "head") return node;
    return findHead(node[3]["children"], depth + 1);
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findHead(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const value of Object.values(node)) {
    const found = findHead(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Parse a raw flight payload (the wire text: `N:JSON` rows) and return the
 * document head's whitelisted elements as transformIndexHtml descriptors.
 * Returns [] when no plain-JSON head is found — never throws on payload
 * shape; a malformed row is skipped like any other non-element.
 */
export function extractHeadTagsFromFlight(
  payload: string
): HtmlTagDescriptor[] {
  for (const line of payload.split("\n")) {
    const sep = line.indexOf(":");
    if (sep < 1) continue;
    let row: unknown;
    try {
      row = JSON.parse(line.slice(sep + 1));
    } catch {
      continue; // model rows only; binary/partial rows are not our head
    }
    const head = findHead(row);
    if (!head) continue;
    const children = head[3]["children"];
    const list = Array.isArray(children) ? children : [children];
    const tags: HtmlTagDescriptor[] = [];
    const collect = (nodes: unknown[]): void => {
      for (const child of nodes) {
        if (!isElement(child)) {
          // Fragments/arrays nest one level down; anything else is skipped.
          if (Array.isArray(child)) collect(child);
          continue;
        }
        if (HEAD_TAGS.has(child[1].toLowerCase())) tags.push(toDescriptor(child));
      }
    };
    collect(list);
    return tags;
  }
  return [];
}
