

export const props = async () => {
    const res = await fetch("https://pokeapi.co/api/v2/pokemon-form/399/")
    return res.json()
}