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
    console.error("Error handling RSC stream:", error);
    return {
      result: "",
      responseHeaders: new Headers(),
      ok: false,
      statusCode: 500,
    };
  }
}

export type RSCStreamResponse = Awaited<ReturnType<typeof handleRSCStream>>;