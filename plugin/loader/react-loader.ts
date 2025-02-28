import * as acorn from "acorn-loose";
import { basename } from "path";

import {
  // @ts-ignore
  setSourceMapsSupport,
  SourceMap,
  type LoadHookContext,
  type ResolveHookContext,
} from "node:module";
import type { MessagePort } from "node:worker_threads";

let stashedGetSource: any = null;
let stashedResolve: any = null;

// Enable source maps with full support
setSourceMapsSupport(true, {
  nodeModules: true, // Enable for node_modules files
  generatedCode: true, // Enable for generated code
});

// Add type for our context with port
interface LoaderContext {
  data?: { port: MessagePort };
}

// Store port globally for use in load hook
let loaderPort: MessagePort | undefined;

export async function getSource(
  url: string,
  context: any,
  defaultGetSource: any
) {
  // We stash this in case we end up needing to resolve export * statements later.
  stashedGetSource = defaultGetSource;
  return defaultGetSource(url, context, defaultGetSource);
}

function addExportedEntry(
  exportedEntries: any,
  localNames: any,
  localName: any,
  exportedName: any,
  type: any,
  loc: any
) {
  if (localNames.has(localName)) {
    // If the same local name is exported more than once, we only need one of the names.
    return;
  }

  exportedEntries.push({
    localName,
    exportedName,
    type,
    loc,
    originalLine: -1,
    originalColumn: -1,
    originalSource: -1,
    nameIndex: -1,
  });
}

function addLocalExportedNames(
  exportedEntries: any,
  localNames: any,
  node: any
) {
  switch (node.type) {
    case "Identifier":
      addExportedEntry(
        exportedEntries,
        localNames,
        node.name,
        node.name,
        null,
        node.loc
      );
      return;

    case "ObjectPattern":
      for (let i = 0; i < node.properties.length; i++)
        addLocalExportedNames(exportedEntries, localNames, node.properties[i]);

      return;

    case "ArrayPattern":
      for (let i = 0; i < node.elements.length; i++) {
        const element = node.elements[i];
        if (element)
          addLocalExportedNames(exportedEntries, localNames, element);
      }

      return;

    case "Property":
      addLocalExportedNames(exportedEntries, localNames, node.value);
      return;

    case "AssignmentPattern":
      addLocalExportedNames(exportedEntries, localNames, node.left);
      return;

    case "RestElement":
      addLocalExportedNames(exportedEntries, localNames, node.argument);
      return;

    case "ParenthesizedExpression":
      addLocalExportedNames(exportedEntries, localNames, node.expression);
      return;
  }
}

function transformServerModule(
  source: string,
  program: any,
  url: string,
  sourceMap: any,
  loader: any,
  port: MessagePort | undefined
) {
  const body = program.body; // This entry list needs to be in source location order.

  const exportedEntries: any[] = []; // Dedupe set.

  const localNames = new Set();

  for (let i = 0; i < body.length; i++) {
    const node = body[i];

    switch (node.type) {
      case "ExportAllDeclaration":
        // If export * is used, the other file needs to explicitly opt into "use server" too.
        break;

      case "ExportDefaultDeclaration":
        if (node.declaration.type === "Identifier") {
          addExportedEntry(
            exportedEntries,
            localNames,
            node.declaration.name,
            "default",
            null,
            node.declaration.loc
          );
        } else if (node.declaration.type === "FunctionDeclaration") {
          if (node.declaration.id) {
            addExportedEntry(
              exportedEntries,
              localNames,
              node.declaration.id.name,
              "default",
              "function",
              node.declaration.id.loc
            );
          }
        }

        continue;

      case "ExportNamedDeclaration":
        if (node.declaration) {
          if (node.declaration.type === "VariableDeclaration") {
            const declarations = node.declaration.declarations;

            for (let j = 0; j < declarations.length; j++) {
              addLocalExportedNames(
                exportedEntries,
                localNames,
                declarations[j].id
              );
            }
          } else {
            const name = node.declaration.id.name;
            addExportedEntry(
              exportedEntries,
              localNames,
              name,
              name,
              node.declaration.type === "FunctionDeclaration"
                ? "function"
                : null,
              node.declaration.id.loc
            );
          }
        }

        if (node.specifiers) {
          const specifiers = node.specifiers;

          for (let j = 0; j < specifiers.length; j++) {
            const specifier = specifiers[j];
            addExportedEntry(
              exportedEntries,
              localNames,
              specifier.local.name,
              specifier.exported.name,
              null,
              specifier.local.loc
            );
          }
        }

        continue;
    }
  }

  let mappings =
    sourceMap && typeof sourceMap.mappings === "string"
      ? sourceMap.mappings
      : "";
  let newSrc = source;

  if (exportedEntries.length > 0) {
    let lastSourceIndex = 0;
    let lastOriginalLine = 0;
    let lastOriginalColumn = 0;
    let lastNameIndex = 0;
    let sourceLineCount = 0;
    let lastMappedLine = 0;

    if (sourceMap) {
      // We iterate source mapping entries and our matched exports in parallel to source map
      // them to their original location.
      let nextEntryIdx = 0;
      let nextEntryLine = exportedEntries[nextEntryIdx].loc.start.line;
      let nextEntryColumn = exportedEntries[nextEntryIdx].loc.start.column;
      readMappings(
        mappings,
        (
          generatedLine: number,
          generatedColumn: number,
          sourceIndex: number,
          originalLine: number,
          originalColumn: number,
          nameIndex: number
        ) => {
          if (
            generatedLine > nextEntryLine ||
            (generatedLine === nextEntryLine &&
              generatedColumn > nextEntryColumn)
          ) {
            // We're past the entry which means that the best match we have is the previous entry.
            if (lastMappedLine === nextEntryLine) {
              // Match
              exportedEntries[nextEntryIdx].originalLine = lastOriginalLine;
              exportedEntries[nextEntryIdx].originalColumn = lastOriginalColumn;
              exportedEntries[nextEntryIdx].originalSource = lastSourceIndex;
              exportedEntries[nextEntryIdx].nameIndex = lastNameIndex;
            }

            nextEntryIdx++;

            if (nextEntryIdx < exportedEntries.length) {
              nextEntryLine = exportedEntries[nextEntryIdx].loc.start.line;
              nextEntryColumn = exportedEntries[nextEntryIdx].loc.start.column;
            } else {
              nextEntryLine = -1;
              nextEntryColumn = -1;
            }
          }

          lastMappedLine = generatedLine;

          if (sourceIndex > -1) {
            lastSourceIndex = sourceIndex;
          }

          if (originalLine > -1) {
            lastOriginalLine = originalLine;
          }

          if (originalColumn > -1) {
            lastOriginalColumn = originalColumn;
          }

          if (nameIndex > -1) {
            lastNameIndex = nameIndex;
          }
        }
      );

      if (nextEntryIdx < exportedEntries.length) {
        if (lastMappedLine === nextEntryLine) {
          // Match
          exportedEntries[nextEntryIdx].originalLine = lastOriginalLine;
          exportedEntries[nextEntryIdx].originalColumn = lastOriginalColumn;
          exportedEntries[nextEntryIdx].originalSource = lastSourceIndex;
          exportedEntries[nextEntryIdx].nameIndex = lastNameIndex;
        }
      }

      for (
        let lastIdx = mappings.length - 1;
        lastIdx >= 0 && mappings[lastIdx] === ";";
        lastIdx--
      ) {
        // If the last mapped lines don't contain any segments, we don't get a callback from readMappings
        // so we need to pad the number of mapped lines, with one for each empty line.
        lastMappedLine++;
      }

      sourceLineCount = program.loc.end.line;

      if (sourceLineCount < lastMappedLine) {
        throw new Error(
          "The source map has more mappings than there are lines."
        );
      } // If the original source string had more lines than there are mappings in the source map.
      // Add some extra padding of unmapped lines so that any lines that we add line up.

      for (
        let extraLines = sourceLineCount - lastMappedLine;
        extraLines > 0;
        extraLines--
      ) {
        mappings += ";";
      }
    } else {
      // If a file doesn't have a source map then we generate a blank source map that just
      // contains the original content and segments pointing to the original lines.
      sourceLineCount = 1;
      let idx = -1;

      while ((idx = source.indexOf("\n", idx + 1)) !== -1) {
        sourceLineCount++;
      }

      mappings = "AAAA" + ";AACA".repeat(sourceLineCount - 1);
      sourceMap = new SourceMap({
        version: 3,
        file: basename(url),
        sources: [url],
        sourcesContent: [source],
        names: [],
        mappings: mappings,
        sourceRoot: "",
      });
      lastSourceIndex = 0;
      lastOriginalLine = sourceLineCount;
      lastOriginalColumn = 0;
      lastNameIndex = -1;
      lastMappedLine = sourceLineCount;

      for (let i = 0; i < exportedEntries.length; i++) {
        // Point each entry to original location.
        const entry = exportedEntries[i];
        entry.originalSource = 0;
        entry.originalLine = entry.loc.start.line; // We use column zero since we do the short-hand line-only source maps above.

        entry.originalColumn = 0; // entry.loc.start.column;
      }
    }

    newSrc += "\n\n;";
    newSrc +=
      'import {registerServerReference} from "react-server-dom-esm/server";\n';

    if (mappings) {
      mappings += ";;";
    }

    const createMapping = createMappingsSerializer(); // Create an empty mapping pointing to where we last left off to reset the counters.

    let generatedLine = 1;
    createMapping(
      generatedLine,
      0,
      lastSourceIndex,
      lastOriginalLine,
      lastOriginalColumn,
      lastNameIndex
    );

    for (let i = 0; i < exportedEntries.length; i++) {
      const entry = exportedEntries[i];
      generatedLine++;

      if (entry.type !== "function") {
        // We first check if the export is a function and if so annotate it.
        newSrc += "if (typeof " + entry.localName + ' === "function") ';
      }

      newSrc += "registerServerReference(" + entry.localName + ",";
      newSrc += JSON.stringify(url) + ",";
      newSrc += JSON.stringify(entry.exportedName) + ");\n";
      mappings += createMapping(
        generatedLine,
        0,
        entry.originalSource,
        entry.originalLine,
        entry.originalColumn,
        entry.nameIndex
      );
    }
  }

  if (sourceMap) {
    // Override with an new mappings and serialize an inline source map.
    sourceMap.mappings = mappings;
    newSrc +=
      "//# sourceMappingURL=data:application/json;charset=utf-8;base64," +
      Buffer.from(JSON.stringify(sourceMap)).toString("base64");
  }
  if (port) {
    port.postMessage({
      type: "SERVER_MODULE",
      url,
      source: newSrc,
    });
  }

  return newSrc;
}

function addExportNames(names: any, node: any) {
  switch (node.type) {
    case "Identifier":
      names.push(node.name);
      return;

    case "ObjectPattern":
      for (let i = 0; i < node.properties.length; i++)
        addExportNames(names, node.properties[i]);

      return;

    case "ArrayPattern":
      for (let i = 0; i < node.elements.length; i++) {
        const element = node.elements[i];
        if (element) addExportNames(names, element);
      }

      return;

    case "Property":
      addExportNames(names, node.value);
      return;

    case "AssignmentPattern":
      addExportNames(names, node.left);
      return;

    case "RestElement":
      addExportNames(names, node.argument);
      return;

    case "ParenthesizedExpression":
      addExportNames(names, node.expression);
      return;
  }
}

function resolveClientImport(specifier: string, parentURL: string) {
  const conditions = ["node", "import"];

  if (stashedResolve === null) {
    throw new Error(
      "Expected resolve to have been called before transformSource"
    );
  }

  return stashedResolve(
    specifier,
    {
      conditions,
      parentURL,
    },
    stashedResolve
  );
}

async function parseExportNamesInto(
  body: any,
  names: any,
  parentURL: string,
  loader: any
) {
  for (let i = 0; i < body.length; i++) {
    const node = body[i];

    switch (node.type) {
      case "ExportAllDeclaration":
        if (node.exported) {
          addExportNames(names, node.exported);
          continue;
        } else {
          const _await$resolveClientI = await resolveClientImport(
              node.source.value,
              parentURL
            ),
            url = _await$resolveClientI.url;

          const _await$loader = await loader(
              url,
              {
                format: "module",
                conditions: [],
                importAttributes: {},
              },
              loader
            ),
            source = _await$loader.source;

          if (typeof source !== "string") {
            throw new Error("Expected the transformed source to be a string.");
          }

          let childBody;

          try {
            childBody = acorn.parse(source, {
              ecmaVersion: "2024" as never,
              sourceType: "module",
            }).body;
          } catch (x) {
            // eslint-disable-next-line react-internal/no-production-logging
            console.error("Error parsing %s %s", url, (x as Error)?.message);
            continue;
          }

          await parseExportNamesInto(childBody, names, url, loader);
          continue;
        }

      case "ExportDefaultDeclaration":
        names.push("default");
        continue;

      case "ExportNamedDeclaration":
        if (node.declaration) {
          if (node.declaration.type === "VariableDeclaration") {
            const declarations = node.declaration.declarations;

            for (let j = 0; j < declarations.length; j++) {
              addExportNames(names, declarations[j].id);
            }
          } else {
            addExportNames(names, node.declaration.id);
          }
        }

        if (node.specifiers) {
          const specifiers = node.specifiers;

          for (let j = 0; j < specifiers.length; j++) {
            addExportNames(names, specifiers[j].exported);
          }
        }

        continue;
    }
  }
}

async function transformClientModule(
  program: any,
  url: string,
  sourceMap: any,
  loader: any
) {
  const body = program.body;
  const names: any[] = [];
  await parseExportNamesInto(body, names, url, loader);


  if (names.length === 0) {
    console.log("[react-loader] No exports found in:", url);
    return "";
  }

  let newSrc =
    'import {registerClientReference} from "react-server-dom-esm/server";\n';

  for (let i = 0; i < names.length; i++) {
    const name = names[i];

    const errorMessage =
      name === "default"
        ? `Attempted to call the default export of ${url} from the server but it's on the client`
        : `Attempted to call ${name}() from the server but ${name} is on the client`;

    const fullError = `${errorMessage}. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.`;

    // Convert file:// URL to relative path for the browser
    const browserUrl = url.replace("file://", "").replace(process.cwd(), "");

    if (name === "default") {
      newSrc += `export default registerClientReference(function() { throw new Error(${JSON.stringify(
        fullError
      )}); }, ${JSON.stringify(browserUrl)}, ${JSON.stringify(name)});\n`;
    } else {
      newSrc += `export const ${name} = registerClientReference(function() { throw new Error(${JSON.stringify(
        fullError
      )}); }, ${JSON.stringify(browserUrl)}, ${JSON.stringify(name)});\n`;
    }
  }

  // Create source map
  if (sourceMap) {
    const newSourceMap = {
      version: 3,
      file: basename(url),
      sources: [url],
      sourcesContent: [program.source],
      names: [],
      mappings: "AAAA;" + ";".repeat(names.length), // Simple line mapping
      sourceRoot: "",
    };

    newSrc +=
      "\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,";
    newSrc += Buffer.from(JSON.stringify(newSourceMap)).toString("base64");
  }

  return newSrc;
}

async function loadClientImport(url: string, defaultTransformSource: any) {
  if (stashedGetSource === null) {
    throw new Error(
      "Expected getSource to have been called before transformSource"
    );
  } // TODO: Validate that this is another module by calling getFormat.

  const _await$stashedGetSour = await stashedGetSource(
      url,
      {
        format: "module",
      },
      stashedGetSource
    ),
    source = _await$stashedGetSour.source;

  const result = await defaultTransformSource(
    source,
    {
      format: "module",
      url,
    },
    defaultTransformSource
  );
  return {
    format: "module",
    source: result.source,
  };
}

export async function transformModuleIfNeeded(
  source: string,
  url: string,
  loader: any,
  port?: MessagePort // Make port parameter optional
) {
  if (
    source.indexOf("use client") === -1 &&
    source.indexOf("use server") === -1
  ) {
    return source;
  }

  let program;
  try {
    program = acorn.parse(source, {
      ecmaVersion: "2024" as never,
      sourceType: "module",
      locations: true,
    });
  } catch (x) {
    console.error(
      "[react-loader] Error parsing %s: %s",
      url,
      (x as Error)?.message
    );
    return source;
  }

  let useClient = false;
  let useServer = false; // Keep this for server transforms

  // Check for directives
  for (const node of program.body) {
    if (node.type !== "ExpressionStatement" || !node.directive) continue;

    if (node.directive === "use client") {
      useClient = true;
      if (port) {
        port.postMessage({
          type: "CLIENT_COMPONENT",
          url,
          source,
        });
      }
      break;
    }
    if (node.directive === "use server") {
      useServer = true;
      break;
    }
  }

  if (useClient) {
    return transformClientModule(program, url, undefined, loader);
  } else if (useServer) {
    return transformServerModule(source, program, url, undefined, loader, port);
  }

  return source;
}

function readMappings(
  mappings: string,
  callback: (
    generatedLine: number,
    generatedColumn: number,
    sourceIndex: number,
    originalLine: number,
    originalColumn: number,
    nameIndex: number
  ) => void
) {
  let line = 1;
  let column = 0;
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let nameIndex = 0;

  let index = 0;
  while (index < mappings.length) {
    if (mappings[index] === ";") {
      line++;
      column = 0;
      index++;
      continue;
    }
    if (mappings[index] === ",") {
      index++;
      continue;
    }

    let [
      generatedColumnDelta = 0,
      sourceIndexDelta = 0,
      originalLineDelta = 0,
      originalColumnDelta = 0,
      nameIndexDelta = 0,
    ] = decodeVLQ(mappings.slice(index));

    // Update positions
    column += generatedColumnDelta;
    sourceIndex += sourceIndexDelta;
    originalLine += originalLineDelta;
    originalColumn += originalColumnDelta;
    nameIndex += nameIndexDelta;

    // Skip the encoded segment
    while (index < mappings.length && !/[,;]/.test(mappings[index])) {
      index++;
    }

    callback(
      line,
      column,
      sourceIndex,
      originalLine,
      originalColumn,
      nameIndex
    );
  }
}

function createMappingsSerializer() {
  let previousGeneratedLine = 1;
  let previousGeneratedColumn = 0;
  let previousOriginalFile = 0;
  let previousOriginalLine = 0;
  let previousOriginalColumn = 0;
  let previousNameIndex = 0;

  return function (
    generatedLine: number,
    generatedColumn: number,
    originalFile: number,
    originalLine: number,
    originalColumn: number,
    nameIndex: number
  ): string {
    // Reset column when moving to a new line
    if (generatedLine > previousGeneratedLine) {
      previousGeneratedColumn = 0;
      let lines = "";
      for (let i = previousGeneratedLine; i < generatedLine; i++) {
        lines += ";";
      }
      previousGeneratedLine = generatedLine;
      if (lines) return lines;
    }

    // Calculate deltas
    const segment = [
      generatedColumn - previousGeneratedColumn,
      originalFile - previousOriginalFile,
      originalLine - previousOriginalLine,
      originalColumn - previousOriginalColumn,
    ];

    if (nameIndex >= 0) {
      segment.push(nameIndex - previousNameIndex);
    }

    // Update previous values
    previousGeneratedColumn = generatedColumn;
    previousOriginalFile = originalFile;
    previousOriginalLine = originalLine;
    previousOriginalColumn = originalColumn;
    previousNameIndex = nameIndex;

    return encodeVLQ(segment) + ",";
  };
}

// VLQ encoding helpers
const VLQ_SHIFT = 5;
const VLQ_CONTINUATION_BIT = 1 << VLQ_SHIFT;
const VLQ_VALUE_MASK = VLQ_CONTINUATION_BIT - 1;
const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeVLQ(numbers: number[]): string {
  return numbers
    .map((num) => {
      // Convert to VLQ
      const vlq = num < 0 ? (-num << 1) | 1 : num << 1;

      let result = "";
      let value = vlq;

      do {
        let digit = value & VLQ_VALUE_MASK;
        value >>>= VLQ_SHIFT;
        if (value > 0) {
          digit |= VLQ_CONTINUATION_BIT;
        }
        result += BASE64_CHARS[digit];
      } while (value > 0);

      return result;
    })
    .join("");
}

function decodeVLQ(str: string): number[] {
  const numbers: number[] = [];
  let value = 0;
  let shift = 0;
  let index = 0;

  while (index < str.length && !/[,;]/.test(str[index])) {
    const digit = BASE64_CHARS.indexOf(str[index]);
    if (digit === -1) break;

    value += (digit & VLQ_VALUE_MASK) << shift;

    if ((digit & VLQ_CONTINUATION_BIT) === 0) {
      const negate = value & 1;
      value >>>= 1;
      numbers.push(negate ? -value : value);
      value = shift = 0;
    } else {
      shift += VLQ_SHIFT;
    }

    index++;
  }

  return numbers;
}

// Initialize hook
export async function initialize(data: { port: MessagePort }) {
  loaderPort = data.port; // Store port
  data.port.postMessage({ type: "INITIALIZED" });
  data.port.unref();
}

// Resolve hook
export async function resolve(
  specifier: string,
  context: ResolveHookContext,
  nextResolve: any
) {
  return nextResolve(specifier, context);
}

// Load hook
export async function load(
  url: string,
  context: LoadHookContext & LoaderContext,
  nextLoad: any
) {
  const result = await nextLoad(url, context);
  if (result.format === "module") {
    const newSrc = await transformModuleIfNeeded(
      result.source,
      url,
      nextLoad,
      loaderPort ?? undefined
    );
    return { ...result, source: newSrc };
  }
  return result;
}

// Transform hook
export async function transformSource(
  source: string,
  context: any,
  defaultTransformSource: any
) {
  const transformed = await defaultTransformSource(
    source,
    context,
    defaultTransformSource
  );

  if (context.format === "module") {
    const transformedSource = transformed.source;
    if (typeof transformedSource !== "string") {
      throw new Error("Expected source to have been transformed to a string.");
    }

    const newSrc = await transformModuleIfNeeded(
      transformedSource,
      context.url,
      (url: string, ctx: any, defaultLoad: any) =>
        loadClientImport(url, defaultTransformSource),
      context.data?.port!
    );
    return { source: newSrc };
  }

  return transformed;
}
