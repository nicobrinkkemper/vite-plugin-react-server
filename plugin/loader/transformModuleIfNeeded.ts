import type { Program } from "./moduleParser.js";
import { transformClientModule } from "./transformClientModule.js";
import { transformServerModule } from "./transformServerModule.js";
import * as acorn from "acorn-loose";

export async function transformModuleIfNeeded(
  source: string,
  url: string,
  isServerEnvironment: boolean = false,
  isClientEnvironment: boolean = !isServerEnvironment,
  isServerFunction: RegExpMatchArray | null = source?.match(
    /^"use server"[\s;]*\n?/m
  ),
  isClientComponent: RegExpMatchArray | null = source?.match(
    /^"use client"[\s;]*\n?/m
  ),
  loader: (id: string) => string | null = (_id: string) => "",
  parser: (source: string) => Program = (source: string) =>
    acorn.parse(source, {
      sourceType: "module",
      ecmaVersion: "latest",
    }) as Program
) {
  if (!source || source.length === 0) {
    source = String(loader(url));
  }
  // Do a quick check for the exact string. If it doesn't exist, don't
  // bother parsing.
  if (!isServerFunction && !isClientComponent) {
    if (!isServerEnvironment) {
      return {
        source: null,
        sourceMap: null,
      };
    }
    return {
      source,
      sourceMap: null,
    };
  }

  // Parse the AST once
  const ast = parser(source);

  if (isClientComponent) {
    if (!isServerEnvironment) {
      return {
        source,
        sourceMap: null,
      };
    }
    const result = await transformClientModule(
      source,
      url,
      isServerEnvironment,
      isClientEnvironment,
      isServerFunction,
      isClientComponent,
      ast,
      null
    );
    return {
      source: result.source,
      sourceMap: result.sourceMap,
    };
  }
  if (!isServerEnvironment) {
    return {
      source: null,
      sourceMap: null,
    };
  }
  return await transformServerModule(
    source,
    url,
    isServerEnvironment,
    isClientEnvironment,
    isServerFunction,
    isClientComponent,
    ast,
    null
  );
}
