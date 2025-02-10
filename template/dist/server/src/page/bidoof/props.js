import { fallbackData } from "./fallbackData.js";
const props = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5e3);
    const res = await fetch("https://pokeapi.co/api/v2/pokemon-form/399/", {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      throw new Error(`Failed to fetch Bidoof: ${res.status}`);
    }
    const body = await res.json();
    return {
      title: "Bidoof",
      description: "It's bidoof.",
      ...body
    };
  } catch (error) {
    return fallbackData;
  }
};
export {
  props
};
