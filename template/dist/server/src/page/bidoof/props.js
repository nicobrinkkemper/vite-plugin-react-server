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
    return res.json();
  } catch (error) {
    console.warn("Failed to fetch Bidoof data:", error);
    return {
      name: "bidoof",
      form_name: "",
      sprites: {
        front_default: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/399.png"
      }
    };
  }
};
export {
  props
};
