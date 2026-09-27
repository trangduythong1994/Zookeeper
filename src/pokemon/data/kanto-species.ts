import rawKantoSpecies from "./kanto-species.json" with { type: "json" };

export type PokemonEvolution = {
  item: string | null;
  method: string;
  minLevel: number | null;
  toNationalDex: number;
  triggerDetail: string | null;
};

export type PokemonSpecies = {
  abilities: { hidden: string[]; normal: string[] };
  baseExperience: number;
  baseHappiness: number;
  baseStats: { attack: number; defense: number; hp: number; specialAttack: number; specialDefense: number; speed: number; total: number };
  captureRate: number;
  color: string;
  eggGroups: string[];
  evolvesFrom: number | null;
  evolutions: PokemonEvolution[];
  genderRate: number;
  growthRate: string;
  habitat: string | null;
  hatchCounter: number;
  heightDm: number;
  isBaby: boolean;
  isLegendary: boolean;
  isMythical: boolean;
  nameEn: string;
  nameVi: string | null;
  nationalDex: number;
  shape: string | null;
  slug: string;
  types: string[];
  weightHg: number;
};

export const KANTO_SPECIES = rawKantoSpecies as PokemonSpecies[];
