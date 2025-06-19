import type { DirectiveInfo, DirectiveMatches, FileLevelDirectiveMatch, FunctionLevelDirectiveMatch } from "./types.js";

export function checkDirectives(
  matches: DirectiveMatches["matches"],
  warnings: DirectiveMatches["warnings"]
): DirectiveInfo {
  const result: DirectiveInfo = {
    fileLevel: null,
    functionLevel: [],
    warnings: [],
  };
  const directiveStart = matches[0]?.range[0] ?? 0;

  // Process file-level directives
  const fileLevelDirectives = matches.filter(
    (match): match is FileLevelDirectiveMatch =>
      match.type === "client" ||
      (match.type === "server" && match.range[0] <= directiveStart)
  );
  if (fileLevelDirectives.length > 0) {
    // Take the first file-level directive
    result.fileLevel = {
      type: fileLevelDirectives[0].type,
      range: fileLevelDirectives[0].range,
    };
  }

  // Process function-level directives
  result.functionLevel = matches.filter(
    (match): match is FunctionLevelDirectiveMatch =>
      match.type === "server" &&
      match.range[0] > directiveStart
  );

  // Add warnings
  result.warnings = warnings;

  return result;
}
