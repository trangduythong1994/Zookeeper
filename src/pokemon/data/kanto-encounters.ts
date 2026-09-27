import rawKantoEncounters from "./kanto-encounters.json" with { type: "json" };

export type EncounterTime = "morning" | "day" | "night";

export type KantoEncounter = {
  biome: string;
  conditions: string[];
  maxLevel: number;
  minLevel: number;
  pokemonNationalDex: number;
  region: "kanto";
  time: EncounterTime;
  weight: number;
};

export const KANTO_ENCOUNTERS = rawKantoEncounters as KantoEncounter[];
