import rawJohtoHoennSpecies from "./johto-hoenn-species.json" with { type: "json" };
import type { PokemonSpecies } from "./kanto-species.js";

export const JOHTO_HOENN_SPECIES = rawJohtoHoennSpecies as PokemonSpecies[];
