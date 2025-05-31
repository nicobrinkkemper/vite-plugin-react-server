export async function handleRSCStream(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "text/x-component",
      ...options.headers,
    },
  });


  const reader = response?.body?.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let responseHeaders = response.headers;
  try {
    while (true) {
      const { done, value } = await reader?.read() ?? { done: true, value: new Uint8Array() };
      

      // Decode each chunk and append to result
      const chunk = decoder.decode(value, { stream: true });
      result += chunk;

      if (done) {
        break;
      }
    }
  } catch (error) {
    console.error("Error reading RSC stream", error);
  } finally {
    reader?.releaseLock();
  }

  return {
    result,
    responseHeaders,
    ok: response.ok,
    statusCode: response.status,
  };
} 

export type RSCStreamResponse = Awaited<ReturnType<typeof handleRSCStream>>;