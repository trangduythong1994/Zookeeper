/**
 * Canonical baseline for the next Kanto encounter import.
 *
 * Let's Go Pikachu/Eevee are the newest games set in Kanto. Both versions are
 * used together so version-exclusive encounters are not silently discarded.
 * PokeAPI location-area responses retain source-game level, method and
 * condition data for each version. Zookeeper's broad biome names and its
 * accelerated time is intentionally a separate game layer.
 */
export const KANTO_ENCOUNTER_SOURCE = {
  apiVersionNames: ["lets-go-pikachu", "lets-go-eevee"],
  gameTitles: ["Pokémon: Let's Go, Pikachu!", "Pokémon: Let's Go, Eevee!"],
  pokemonDbVersionGroup: "lets-go-pikachu-lets-go-eevee",
  source: "https://pokeapi.co/docs/v2#location-areas",
} as const;
