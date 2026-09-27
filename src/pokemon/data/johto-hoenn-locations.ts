import rawLocations from "./kanto-johto-hoenn-locations.json" with { type: "json" };

export type SourceEncounter = {
  conditions: string[];
  maxLevel: number;
  method: string;
  minLevel: number;
  pokemonNationalDex: number;
  rate: number;
};

export type SourceLocationArea = { encounters: SourceEncounter[]; key: string; name: string };
export type SourceLocation = { areas: SourceLocationArea[]; key: string; name: string };
export type RegionLocationSource = { gameKey: string; locations: SourceLocation[]; regionKey: "kanto" | "johto" | "hoenn" };

export const JOHTO_HOENN_LOCATION_SOURCES = rawLocations as RegionLocationSource[];
