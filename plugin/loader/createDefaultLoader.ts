import { readFileSync } from "fs";
import type { LoaderResult } from "./parse.js";
import { parse } from "./parse.js";

export interface Loader {
  (id: string): LoaderResult;
}

/**
 * Creates a default loader function that either uses provided source or reads from file
 */
export function createDefaultLoader(source?: string): Loader {
  if(typeof source === 'string') {
    return function load(id: string): LoaderResult {
      return parse(source, id);
    };
  }
  return function load(id: string): LoaderResult {
    const source = readFileSync(id, 'utf-8');
    return parse(source, id);
  };
} 