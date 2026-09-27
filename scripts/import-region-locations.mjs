/* global console, fetch */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const API = "https://pokeapi.co/api/v2";
const OUTPUT = resolve("src/pokemon/data/kanto-johto-hoenn-locations.json");
const SOURCES = [
  { regionKey: "kanto", gameKeys: ["lets-go-pikachu", "lets-go-eevee"], gameKey: "lets-go-pikachu-lets-go-eevee" },
  { regionKey: "johto", gameKeys: ["heartgold"], gameKey: "heartgold" },
  { regionKey: "hoenn", gameKeys: ["ruby"], gameKey: "ruby" },
];

async function getJson(pathOrUrl) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API}${pathOrUrl}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function mapWithConcurrency(values, limit, mapper) {
  const result = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < values.length) {
      const index = next++;
      result[index] = await mapper(values[index]);
    }
  }));
  return result;
}

const regions = await mapWithConcurrency(SOURCES, 2, async ({ regionKey, gameKeys, gameKey }) => {
  const region = await getJson(`/region/${regionKey}`);
  const locations = await mapWithConcurrency(region.locations, 8, async (reference) => {
    const location = await getJson(reference.url);
    const name = location.names.find((entry) => entry.language.name === "en")?.name ?? location.name;
    const areas = await mapWithConcurrency(location.areas, 8, async (areaReference) => {
      const area = await getJson(areaReference.url);
      const encounters = area.pokemon_encounters.flatMap((entry) => {
        const versions = entry.version_details.filter((detail) => gameKeys.includes(detail.version.name));
        if (versions.length === 0) return [];
        const nationalDex = Number(entry.pokemon.url.match(/\/pokemon\/(\d+)\/?$/)?.[1]);
        return versions.flatMap((version) => version.encounter_details.map((detail) => ({
          pokemonNationalDex: nationalDex,
          method: detail.method.name,
          rate: detail.chance,
          minLevel: detail.min_level,
          maxLevel: detail.max_level,
          conditions: detail.condition_values.map((condition) => condition.name),
        })));
      }).filter((encounter) => Number.isInteger(encounter.pokemonNationalDex) && encounter.pokemonNationalDex <= 386);
      return { key: `${regionKey}-${area.name}`, name: area.name, encounters };
    });
    return { key: `${regionKey}-${location.name}`, name, areas };
  });
  return { regionKey, gameKey, locations };
});

await writeFile(OUTPUT, JSON.stringify(regions));
const locationCount = regions.reduce((total, region) => total + region.locations.length, 0);
const encounterCount = regions.flatMap((region) => region.locations).flatMap((location) => location.areas).reduce((total, area) => total + area.encounters.length, 0);
console.log(`Wrote ${locationCount} locations and ${encounterCount} encounters to ${OUTPUT}`);
