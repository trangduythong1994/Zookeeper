/* global URL, console, fetch */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const FROM = 152;
const TO = 386;
const OUTPUT = resolve("src/pokemon/data/johto-hoenn-species.json");
const API = "https://pokeapi.co/api/v2";

async function getJson(path) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
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

const chains = new Map();
async function evolutionFor(species) {
  if (!species.evolution_chain) return [];
  const url = species.evolution_chain.url;
  if (!chains.has(url)) chains.set(url, getJson(new URL(url).pathname.replace("/api/v2", "")));
  const chain = await chains.get(url);
  const node = findNode(chain.chain, species.name);
  return (node?.evolves_to ?? []).map((child) => {
    const detail = child.evolution_details[0] ?? {};
    return {
      toNationalDex: Number(child.species.url.match(/\/pokemon-species\/(\d+)\/?$/)?.[1]),
      method: detail.trigger?.name ?? "unknown",
      minLevel: detail.min_level ?? null,
      item: detail.item?.name ?? null,
      triggerDetail: triggerDetail(detail),
    };
  }).filter((evolution) => Number.isInteger(evolution.toNationalDex) && evolution.toNationalDex <= TO);
}

function findNode(node, name) {
  if (node.species.name === name) return node;
  for (const child of node.evolves_to) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return undefined;
}

function triggerDetail(detail) {
  const fields = [
    ["min_happiness", detail.min_happiness],
    ["min_affection", detail.min_affection],
    ["min_beauty", detail.min_beauty],
    ["time_of_day", detail.time_of_day || null],
    ["known_move", detail.known_move?.name],
    ["held_item", detail.held_item?.name],
    ["location", detail.location?.name],
  ].filter(([, value]) => value !== null && value !== undefined);
  return fields.length === 0 ? null : fields.map(([key, value]) => `${key}:${value}`).join(",");
}

const ids = Array.from({ length: TO - FROM + 1 }, (_, index) => index + FROM);
const species = await mapWithConcurrency(ids, 8, async (nationalDex) => {
  const [pokemon, speciesData] = await Promise.all([getJson(`/pokemon/${nationalDex}`), getJson(`/pokemon-species/${nationalDex}`)]);
  const stats = Object.fromEntries(pokemon.stats.map((entry) => [entry.stat.name, entry.base_stat]));
  const evolutions = await evolutionFor(speciesData);
  return {
    nationalDex,
    slug: pokemon.name,
    nameEn: speciesData.names.find((name) => name.language.name === "en")?.name ?? pokemon.name,
    nameVi: null,
    types: pokemon.types.sort((left, right) => left.slot - right.slot).map((entry) => entry.type.name),
    baseStats: {
      hp: stats.hp,
      attack: stats.attack,
      defense: stats.defense,
      specialAttack: stats["special-attack"],
      specialDefense: stats["special-defense"],
      speed: stats.speed,
      total: Object.values(stats).reduce((total, value) => total + value, 0),
    },
    heightDm: pokemon.height,
    weightHg: pokemon.weight,
    abilities: {
      normal: pokemon.abilities.filter((entry) => !entry.is_hidden).sort((left, right) => left.slot - right.slot).map((entry) => entry.ability.name),
      hidden: pokemon.abilities.filter((entry) => entry.is_hidden).sort((left, right) => left.slot - right.slot).map((entry) => entry.ability.name),
    },
    captureRate: speciesData.capture_rate,
    baseExperience: pokemon.base_experience,
    baseHappiness: speciesData.base_happiness,
    growthRate: speciesData.growth_rate.name,
    genderRate: speciesData.gender_rate,
    eggGroups: speciesData.egg_groups.map((entry) => entry.name),
    hatchCounter: speciesData.hatch_counter,
    color: speciesData.color.name,
    shape: speciesData.shape?.name ?? null,
    habitat: speciesData.habitat?.name ?? null,
    isBaby: speciesData.is_baby,
    isLegendary: speciesData.is_legendary,
    isMythical: speciesData.is_mythical,
    evolvesFrom: (() => {
      const parent = speciesData.evolves_from_species ? Number(speciesData.evolves_from_species.url.match(/\/pokemon-species\/(\d+)\/?$/)?.[1]) : null;
      return parent !== null && parent < nationalDex ? parent : null;
    })(),
    evolutions,
  };
});

await writeFile(OUTPUT, JSON.stringify(species));
console.log(`Wrote ${species.length} species to ${OUTPUT}`);
