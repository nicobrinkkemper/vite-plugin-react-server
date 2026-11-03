export async function handleRSCStream(url: string, options: RequestInit = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "text/x-component",
        ...options.headers,
      },
    });

    if (!response.ok) {
      console.log(response)
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let result = "";
    const responseHeaders = response.headers;

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        // Decode each chunk and append to result
        const chunk = decoder.decode(value, { stream: true });
        result += chunk;

        if (done) {
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      result,
      responseHeaders,
      ok: response.ok,
      statusCode: response.status,
    };
  } catch (error) {
    console.error("[test/rsc-stream] Error handling RSC stream:", error);
    return {
      result: "",
      responseHeaders: new Headers(),
      ok: false,
      statusCode: 500,
    };
  }
}

export type RSCStreamResponse = Awaited<ReturnType<typeof handleRSCStream>>;

/**
 * React 19.3 outlines a client reference's module id into its own string row
 * and points the import row at it (`a:"/src/x.tsx"` + `b:I["$a","X"]`), where
 * 19.2 wrote it inline (`b:I["/src/x.tsx","X"]`). Folds the outlined ids back
 * in so an assertion about which module a reference names reads the same on
 * both.
 */
export function inlineImportIds(flight: string): string {
  const strings = new Map<string, string>();
  for (const [, id, value] of flight.matchAll(/^([0-9a-f]+):("(?:[^"\\]|\\.)*")$/gm)) {
    strings.set(id, value);
  }
  return flight.replace(/I\["\$([0-9a-f]+)"/g, (row, id) =>
    strings.has(id) ? `I[${strings.get(id)}` : row
  );
}
