import { fallbackData, type FallbackData } from "./fallbackData";


export const props = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const res = await fetch("https://pokeapi.co/api/v2/pokemon-form/399/", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Failed to fetch Bidoof: ${res.status}`);
    }
    const body = await res.json();
    return {
        title: 'Bidoof',
        description: 'It\'s bidoof.',
        ...body,
    } as FallbackData;
  } catch (error) {
    // Fallback data
    return fallbackData
  }
};
