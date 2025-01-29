interface RSCChunk {
  id: number;
  type?: string;
  content: any;
  timing?: number;
}

export function preserveRSC(chunk: string): string {
  // Try to parse RSC format: <id>:<content>
  const match = chunk.match(/^(\d+):(.+)$/);
  if (!match) return chunk;

  const [_, id, content] = match;

  // Handle different chunk types
  if (content.startsWith('"$S')) {
    // Fragment type
    return chunk;
  }

  if (content.startsWith("I[")) {
    // Import type
    return chunk;
  }

  try {
    // Try to parse as array/object
    const parsed = JSON.parse(content);

    // Check if this is a component chunk
    if (Array.isArray(parsed) && parsed[2] === "html") {
      const componentChunk = {
        name: "Page",
        env: "Server",
        key: "page",
        owner: null,
        stack: [],
        props: parsed[3],
      };
      return `${id}:${JSON.stringify(componentChunk)}\n:N${Date.now()}`;
    }

    return chunk;
  } catch {
    return chunk;
  }
}
