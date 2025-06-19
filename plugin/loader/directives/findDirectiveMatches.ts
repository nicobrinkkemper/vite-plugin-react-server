import type { DirectiveMatch, DirectiveMatches, DirectiveWarning } from "./types.js";

export function findDirectiveMatches(
  source: string,
): DirectiveMatches {
  const matches: DirectiveMatch[] = [];
  const warnings: DirectiveWarning[] = [];

  // Find all directive matches in order
  const serverMatches = findServerDirectives(source);
  const clientMatches = findClientDirectives(source);

  // Sort all matches by their position in the source
  const allMatches = [...serverMatches, ...clientMatches].sort((a, b) => a.range[0] - b.range[0]);

  // If no directives found, return early
  if (allMatches.length === 0) {
    return { matches, warnings };
  }

  // Add all matches as function-level for now
  // analyzeDirectives will determine if they're file-level
  for (const match of allMatches) {
    matches.push(match);
  }

  return { matches, warnings };
}

function findServerDirectives(source: string): DirectiveMatch[] {
  const matches: DirectiveMatch[] = [];
  const regex = /"use server"|'use server'/g;
  let match;

  while ((match = regex.exec(source)) !== null) {
    matches.push({
      type: "server",
      range: [match.index, match.index + match[0].length]
    });
  }

  return matches;
}

function findClientDirectives(source: string): DirectiveMatch[] {
  const matches: DirectiveMatch[] = [];
  const regex = /"use client"|'use client'/g;
  let match;

  while ((match = regex.exec(source)) !== null) {
    matches.push({
      type: "client",
      range: [match.index, match.index + match[0].length]
    });
  }

  return matches;
} 