import type { Node } from "acorn";
import { getFunctionBody } from "./getFunctionBody.js";

/**
 * Checks if a directive is at the start of a function body
 */
export function isDirectiveAtStart(node: Node, directiveValue: string): boolean {
  const body = getFunctionBody(node);
  if (!body) return false;

  return body.body.length > 0 && 
    body.body[0].type === "ExpressionStatement" &&
    body.body[0].expression.type === "Literal" &&
    body.body[0].expression.value === directiveValue;
}

/**
 * Gets the directive value from a match type
 */
export function getDirectiveValue(type: "server" | "client"): string {
  return type === "server" ? "use server" : "use client";
}

/**
 * Checks if match range overlaps with directive node range
 */
export function matchOverlapsDirective(
  matchRange: [number, number], 
  directiveStart: number, 
  directiveEnd: number
): boolean {
  return (matchRange[0] >= directiveStart && matchRange[0] < directiveEnd) ||
         (matchRange[1] > directiveStart && matchRange[1] <= directiveEnd) ||
         (matchRange[0] <= directiveStart && matchRange[1] >= directiveEnd);
} 