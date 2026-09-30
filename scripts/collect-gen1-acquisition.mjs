/* global URLSearchParams, console, fetch, process */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "src", "pokemon", "data");
const API = "https://bulbapedia.bulbagarden.net/w/api.php";
const generationArgument = process.argv.find((argument) => argument.startsWith("--generation="));
const GENERATION = Number(generationArgument?.split("=")[1] ?? 1);
const CONFIGS = {
  1: {
  startDex: 1,
  endDex: 151,
  masterTemplate: "Avail-1",
  masterHeading: "===Generation I Pokémon===",
  nextMasterHeading: "===Generation II Pokémon===",
  locationGeneration: "I",
  nextLocationGeneration: "II",
  versionKeys: ["red", "green_blue_en", "blue_japan", "yellow"],
  batches: [
    { start: 1, end: 50, file: "gen1-acquisition-001-050.json" },
    { start: 51, end: 100, file: "gen1-acquisition-051-100.json" },
    { start: 101, end: 151, file: "gen1-acquisition-101-151.json" },
  ],
  statisticsFile: "gen1-acquisition-statistics.json",
  cacheName: "bulbapedia-gen1-cache",
  },
  2: {
  startDex: 152,
  endDex: 251,
  masterTemplate: "Avail-2",
  masterHeading: "===Generation II Pokémon===",
  nextMasterHeading: "===Generation III Pokémon===",
  locationGeneration: "II",
  nextLocationGeneration: "III",
  versionKeys: ["gold", "silver", "crystal"],
  batches: [
    { start: 152, end: 185, file: "gen2-acquisition-152-185.json" },
    { start: 186, end: 218, file: "gen2-acquisition-186-218.json" },
    { start: 219, end: 251, file: "gen2-acquisition-219-251.json" },
  ],
  statisticsFile: "gen2-acquisition-statistics.json",
  cacheName: "bulbapedia-gen2-cache",
  },
  3: {
    startDex: 252,
    endDex: 386,
    masterTemplate: "Avail-3",
    masterHeading: "===Generation III Pokémon===",
    nextMasterHeading: "===Generation IV Pokémon===",
    locationGeneration: "III",
    nextLocationGeneration: "IV",
    versionKeys: ["ruby", "sapphire", "firered", "leafgreen", "emerald"],
    batches: [
      { start: 252, end: 296, file: "gen3-acquisition-252-296.json" },
      { start: 297, end: 341, file: "gen3-acquisition-297-341.json" },
      { start: 342, end: 386, file: "gen3-acquisition-342-386.json" },
    ],
    statisticsFile: "gen3-acquisition-statistics.json",
    cacheName: "bulbapedia-gen3-cache",
  },
};
const CONFIG = CONFIGS[GENERATION];
if (!CONFIG) throw new Error(`Unsupported generation: ${GENERATION}`);
const CACHE_DIR = path.join(ROOT, "work", CONFIG.cacheName);
const USER_AGENT = `ZookeeperGen${GENERATION}AvailabilityResearch/1.0 (local data compilation)`;
const VERSION_KEYS = CONFIG.versionKeys;
const BATCHES = CONFIG.batches;

await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(CACHE_DIR, { recursive: true });

async function apiRequest(params, { post = false } = {}) {
  const body = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const response = await fetch(post ? API : `${API}?${body}`, {
    method: post ? "POST" : "GET",
    headers: {
      "User-Agent": USER_AGENT,
      ...(post ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: post ? body : undefined,
  });
  if (!response.ok) throw new Error(`Bulbapedia API returned ${response.status}`);
  const json = await response.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json;
}

async function getPageWikitext(title) {
  const cacheFile = path.join(CACHE_DIR, `${title.replaceAll(/[\\/:*?"<>|]/g, "_")}.txt`);
  try {
    return await readFile(cacheFile, "utf8");
  } catch {
    const json = await apiRequest({ action: "parse", page: title, prop: "wikitext" });
    const wikitext = json.parse.wikitext;
    await writeFile(cacheFile, wikitext, "utf8");
    return wikitext;
  }
}

function splitTopLevel(value, delimiter = "|") {
  const parts = [];
  let current = "";
  let templateDepth = 0;
  let linkDepth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const pair = value.slice(i, i + 2);
    if (pair === "{{") {
      templateDepth += 1;
      current += pair;
      i += 1;
      continue;
    }
    if (pair === "}}") {
      templateDepth -= 1;
      current += pair;
      i += 1;
      continue;
    }
    if (pair === "[[") {
      linkDepth += 1;
      current += pair;
      i += 1;
      continue;
    }
    if (pair === "]]" && linkDepth > 0) {
      linkDepth -= 1;
      current += pair;
      i += 1;
      continue;
    }
    if (value[i] === delimiter && templateDepth === 0 && linkDepth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += value[i];
    }
  }
  parts.push(current);
  return parts;
}

function extractTopLevelTemplates(text, namePrefix) {
  const results = [];
  for (let i = 0; i < text.length - 1; i += 1) {
    if (text.slice(i, i + 2) !== "{{") continue;
    let depth = 0;
    let end = -1;
    for (let j = i; j < text.length - 1; j += 1) {
      const pair = text.slice(j, j + 2);
      if (pair === "{{") {
        depth += 1;
        j += 1;
      } else if (pair === "}}") {
        depth -= 1;
        if (depth === 0) {
          end = j + 2;
          break;
        }
        j += 1;
      }
    }
    if (end === -1) break;
    const raw = text.slice(i + 2, end - 2);
    const name = splitTopLevel(raw)[0].trim();
    if (name.startsWith(namePrefix)) results.push({ name, raw: text.slice(i, end) });
    i = end - 1;
  }
  return results;
}

function parseTemplate(template) {
  const inner = template.raw.slice(2, -2);
  const parts = splitTopLevel(inner);
  const positional = [];
  const named = {};
  for (const part of parts.slice(1)) {
    const equals = part.indexOf("=");
    if (equals > 0 && /^[\w ]+$/.test(part.slice(0, equals))) {
      named[part.slice(0, equals).trim()] = part.slice(equals + 1).trim();
    } else {
      positional.push(part.trim());
    }
  }
  return { name: parts[0].trim(), positional, named, raw: template.raw };
}

function parseMasterRows(wikitext) {
  const start = wikitext.indexOf(CONFIG.masterHeading);
  const end = wikitext.indexOf(CONFIG.nextMasterHeading, start);
  const rows = extractTopLevelTemplates(wikitext.slice(start, end), CONFIG.masterTemplate)
    .map(parseTemplate)
    .filter((template) => !template.named.form)
    .map((template) => {
      const [dexText, name, ...codes] = template.positional;
      return { nationalDex: Number(dexText), name, codes: codes.slice(0, VERSION_KEYS.length) };
    })
    .filter((row) => row.nationalDex >= CONFIG.startDex && row.nationalDex <= CONFIG.endDex);
  const expected = CONFIG.endDex - CONFIG.startDex + 1;
  if (rows.length !== expected) throw new Error(`Expected ${expected} master rows, got ${rows.length}`);
  return rows;
}

function getGenerationLocationEntries(wikitext) {
  const literalHeading = wikitext.indexOf("===Game locations===");
  const templatedHeading = wikitext.indexOf("locations===");
  const heading = literalHeading >= 0 ? literalHeading : templatedHeading >= 0 ? templatedHeading : 0;
  const generationStart = wikitext.indexOf(`{{Availability/Gen|gen=${CONFIG.locationGeneration}}}`, heading);
  const generationEnd = wikitext.indexOf(`{{Availability/Gen|gen=${CONFIG.nextLocationGeneration}}}`, generationStart);
  const section = wikitext.slice(generationStart, generationEnd > -1 ? generationEnd : wikitext.indexOf("====In side games====", generationStart));
  return extractTopLevelTemplates(section, "Availability/Entry").map(parseTemplate);
}

function entryVersions(entry) {
  const first = entry.named.v;
  const second = entry.named.v2;
  const japan = entry.named.ex?.includes("Japan") || entry.named.link?.includes("Japanese");
  const versions = [];
  const add = (version) => {
    if (GENERATION === 3) {
      if (version === "Ruby") versions.push("ruby");
      else if (version === "Sapphire") versions.push("sapphire");
      else if (version === "FireRed") versions.push("firered");
      else if (version === "LeafGreen") versions.push("leafgreen");
      else if (version === "Emerald") versions.push("emerald");
      return;
    }
    if (GENERATION === 2) {
      if (version === "Gold") versions.push("gold");
      else if (version === "Silver") versions.push("silver");
      else if (version === "Crystal") versions.push("crystal");
      return;
    }
    if (version === "Red") versions.push("red");
    else if (version === "Yellow") versions.push("yellow");
    else if (version === "Blue" && japan) versions.push("blue_japan");
    else if (version === "Blue") versions.push("green_blue_en");
  };
  add(first);
  if (GENERATION === 3 && first === "Ruby" && second === "Sapphire") versions.push("sapphire");
  else if (GENERATION === 3 && first === "FireRed" && second === "LeafGreen") versions.push("leafgreen");
  else if (GENERATION === 2 && first === "Gold" && second === "Silver") versions.push("silver");
  else if (second === "Blue" && first === "Red") versions.push("green_blue_en");
  else add(second);
  return [...new Set(versions)];
}

function splitBreaks(area) {
  return area.split(/<br\s*\/?\s*>/i).map((part) => part.trim()).filter(Boolean);
}

function renderTemplate(name, positional, named) {
  const key = name.trim().toLowerCase();
  if (key === "rt") return `Route ${positional[0]}`;
  if (key === "rtn") return positional[0] ?? "";
  if (key === "safari") return "Safari Zone";
  if (key === "fb") return positional.at(-1) ?? "";
  if (key === "p") return positional[0] ?? "";
  if (key === "pdollar") return "₽";
  if (key === "badge") return `${positional[0] ?? ""} Badge`.trim();
  if (key === "game") return positional[1] === "s" ? "games" : positional[0] ?? "game";
  if (key === "sup/t") {
    const time = { M: "Morning", D: "Day", N: "Night" }[positional[0]] ?? positional[0] ?? "";
    return time ? ` (${time})` : "";
  }
  if (key === "sup/1" || key === "sup/2" || key === "sup/3" || key === "sup/4") return "";
  if (key === "gameabbrev1" || key === "gameabbrev2" || key === "gameabbrev3" || key === "gameabbrev4") return positional.join("/");
  if (key === "tt") return positional.length > 1 ? ` (${positional.at(-1)})` : "";
  if (key === "pkmn" || key === "pkmn2" || key === "tc") return positional.at(-1) ?? "Pokémon";
  if (key === "steven") return "Steven";
  if (key === "gdis" || key === "obp") return positional[0] ?? "";
  if (key === "ga") return positional[0] ?? "";
  if (key === "ka") return positional.at(-1) ?? positional[0] ?? "";
  if (key === "dl") return positional.at(-1) ?? "";
  if (key === "m") return positional.at(-1) ?? "";
  return named.text ?? positional.at(-1) ?? "";
}

function wikitextToPlain(input) {
  let text = input;
  for (let pass = 0; pass < 8 && text.includes("{{"); pass += 1) {
    const templates = extractTopLevelTemplates(text, "");
    if (!templates.length) break;
    for (const template of templates.reverse()) {
      const parsed = parseTemplate(template);
      const replacement = renderTemplate(parsed.name, parsed.positional, parsed.named);
      const index = text.lastIndexOf(template.raw);
      if (index >= 0) text = text.slice(0, index) + replacement + text.slice(index + template.raw.length);
    }
  }
  return text
    .replaceAll(/\[\[[^\]]*?\|([^\]]+)\]\]/g, "$1")
    .replaceAll(/\[\[([^\]#]+)(?:#[^\]]+)?\]\]/g, "$1")
    .replaceAll(/'{2,5}/g, "")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/&nbsp;/g, " ")
    .replaceAll(/\s+([,.;:)])/g, "$1")
    .replaceAll(/([(])\s+/g, "$1")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function linkDisplays(input) {
  const values = [];
  for (const match of input.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const [target, display] = match[1].split("|");
    const targetName = target.split("#")[0].trim();
    const displayName = (display ?? targetName).trim();
    values.push({ index: match.index, value: displayName === "Gym" ? targetName : displayName });
  }
  for (const template of extractTopLevelTemplates(input, "")) {
    const parsed = parseTemplate(template);
    const key = parsed.name.toLowerCase();
    let value;
    if (key === "rt" || key === "rtn") value = `Route ${parsed.positional[0]}`;
    else if (key === "safari") value = "Safari Zone";
    else if (["fb", "ka", "dl", "ho"].includes(key)) value = parsed.positional.at(-1);
    else if (["gdis", "obp"].includes(key)) value = parsed.positional[0];
    if (value) values.push({ index: input.indexOf(template.raw), value: value.trim() });
  }
  return values.sort((left, right) => left.index - right.index).map((entry) => entry.value);
}

const NON_LOCATION_LINKS = new Set([
  "Route", "Routes", "Trade", "Evolve", "Event", "First partner Pokémon", "First Pokémon",
  "Received", "Buy", "Only one", "Only two", "Good Rod", "Old Rod", "Super Rod", "Surf",
  "friendship", "the partner Pikachu", "a girl", "a boy", "Officer Jenny", "Professor Oak", "Professor Elm", "Kiyo", "Magikarp salesman", "received", "C",
  "Breed", "Odd Egg", "Headbutt tree", "Headbutt trees", "(only high-encounter trees)", "Rock Smash",
  "Silver Wing", "Rainbow Wing", "GS Ball",
  "Professor Birch", "Hall of Fame", "Fishing", "Grass", "Swarm", "swarm", "mixing records",
  "Eon Ticket", "AuroraTicket", "Old Sea Map",
  "Kakuna", "Metapod", "Ivysaur", "Venusaur", "Charmeleon", "Charizard", "Wartortle", "Blastoise",
]);

function candidateLocations(segment) {
  return [...new Set(linkDisplays(segment).filter((value) => !NON_LOCATION_LINKS.has(value) && !/^(?:In-game trade|List of in-game event)/.test(value)))];
}

function classifySegment(segment, code) {
  const plain = wikitextToPlain(segment);
  const locations = candidateLocations(segment);
  const method = (label, methodLocations = locations, notes = plain || "Source does not specify further details") => ({
    label,
    locations: methodLocations,
    notes,
  });

  const rods = [];
  if (/\bOld Rod\b/i.test(plain)) rods.push(method("old_rod", locations));
  if (/\bGood Rod\b/i.test(plain)) rods.push(method("good_rod", locations));
  if (/\bSuper Rod\b/i.test(plain)) rods.push(method("super_rod", locations));
  if (rods.length) return rods;
  if (/\bFishing\b|fishing spots/i.test(plain)) return [method("fishing", locations.filter((item) => item !== "Fishing"))];
  if (/\bDive\b|\bUnderwater\b/i.test(plain)) return [method("dive", locations.filter((item) => item !== "Dive"))];
  if (/\bSurf(?:ing)?\b/i.test(plain)) return [method("surf", locations.filter((item) => item !== "Surf"))];
  if (/\bHeadbutt tree/i.test(plain)) return [method("headbutt", locations)];
  if (/\bRock Smash\b/i.test(plain)) return [method("rock_smash", locations)];
  if (/\bRoaming\b/i.test(plain) && /requires Eon Ticket/i.test(plain)) {
    return [
      method("roaming", locations.filter((item) => /^(?:Hoenn|Kanto)$/.test(item))),
      method("event", locations.filter((item) => /Island$/.test(item))),
    ];
  }
  if (/\bRoaming\b/i.test(plain)) return [method("roaming", locations)];
  if (/\bBreed\b|\bbreeding\b/i.test(plain)) return [method("breeding", [], plain || "Source does not specify further details")];
  if (/First partner Pokémon|First Pokémon/i.test(segment)) return [method("starter", locations)];
  if (/requires (?:Eon Ticket|AuroraTicket|Old Sea Map)/i.test(plain)) {
    return [method("event", locations.filter((item) => !/(?:Ticket|Map)$/.test(item)))];
  }
  if (/requires GS Ball/i.test(plain)) return [method("static", locations)];
  if (/requires Devon Scope/i.test(plain)) return [method("static", locations)];
  if (/\bTrade\b/i.test(plain) && /\bEvolve\b/i.test(plain)) return [method("trade", locations), method("evolution", [])];
  if (/\bTrade\b/i.test(plain) && /\bEvent\b/i.test(plain)) return [method("trade", locations), method("event", [])];
  if (/\bEvolve\b/i.test(plain)) return [method("evolution", [])];
  if (/\bSwarm\b/i.test(plain)) return [method("swarm", locations)];
  if (/\bTrade\b/i.test(plain)) return [method("trade", locations.filter((item) => !/^(?:Rattata|Pidgey|Poliwhirl|Spearow|Nidoran|Golduck|Clefairy|Lickitung|Slowbro|Raichu|Venonat|Tangela|Dewgong|Electrode|Rhydon|Ponyta|Growlithe)$/.test(item)))];
  if (/\bEvent\b/i.test(plain)) return [method("event", [])];
  if (/Revive from/i.test(plain)) return [method("fossil", locations.filter((item) => !/Fossil|Amber/.test(item)))];
  if (/Game Corner/i.test(plain)) {
    const corner = locations.filter((item) => /Game Corner|Celadon City/.test(item));
    const wild = locations.filter((item) => !/Game Corner|Celadon City/.test(item));
    return [...(wild.length ? [method("wild_walk", wild)] : []), method("game_corner", corner)];
  }
  if (/Weather Institute/i.test(plain) && code === "R") return [method("gift", locations)];
  if (/Only one|Only two/i.test(plain)) return [method("static", locations)];
  if (/Received|Given|Buy from/i.test(plain)) return [method("gift", locations)];
  if (code === "C") return [method("wild_walk", locations)];
  if (code === "R") return [method("gift", locations)];
  if (code === "E" || code === "ET" || code === "EvE") return [method("evolution", [])];
  if (code === "T") return [method("trade", [])];
  if (code === "Ev") return [method("event", [])];
  if (code === "B") return [method("breeding", [])];
  return [method("unavailable", [])];
}

function fallbackMethods(code) {
  if (code === "E" || code === "ET" || code === "EvE") return [{ label: "evolution", locations: [], notes: "Source does not specify further details" }];
  if (code === "T") return [{ label: "trade", locations: [], notes: "Source does not specify further details" }];
  if (code === "Ev") return [{ label: "event", locations: [], notes: "Source does not specify further details" }];
  if (code === "B") return [{ label: "breeding", locations: [], notes: "Source does not specify further details" }];
  if (code.endsWith("B")) return [{ label: "breeding", locations: [], notes: "Source does not specify further details" }];
  return [{ label: "unavailable", locations: [], notes: "Source does not specify further details" }];
}

function sourceUrl(name) {
  return `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(name).replaceAll("%20", "_")}_(Pok%C3%A9mon)`;
}

function titleCaseItem(item) {
  return item.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function describeEvolution(evolution) {
  if (!evolution) return "Source does not specify further details";
  if (evolution.method === "level" && evolution.level != null) {
    return `Evolves from ${evolution.fromName} at level ${evolution.level}${evolution.condition ? ` when ${evolution.condition}` : ""}`;
  }
  if (evolution.method === "level" && evolution.friendship != null) {
    return `Evolves from ${evolution.fromName} by leveling up with friendship of at least ${evolution.friendship}${evolution.timeOfDay ? ` during the ${evolution.timeOfDay}` : ""}`;
  }
  if (evolution.method === "level" && evolution.condition) {
    return `Evolves from ${evolution.fromName} by leveling up when ${evolution.condition}`;
  }
  if (evolution.method === "item") return `Evolves from ${evolution.fromName} using a ${evolution.item}`;
  if (evolution.method === "trade") {
    const article = evolution.heldItem && /^[aeiou]/i.test(evolution.heldItem) ? "an" : "a";
    return `Evolves from ${evolution.fromName} when traded${evolution.heldItem ? ` while holding ${article} ${evolution.heldItem}` : ""}`;
  }
  return `Evolves from ${evolution.fromName}${evolution.condition ? ` (${evolution.condition})` : ""}`;
}

function validateEvolutionAgainstBulbapedia(wikitext, evolution, pokemonName) {
  if (!evolution) return;
  const headingMatch = /^===.*Evolution.*data===$/m.exec(wikitext);
  const start = headingMatch?.index ?? 0;
  const end = headingMatch ? wikitext.indexOf("===Sprites===", start) : -1;
  const section = headingMatch ? wikitext.slice(start, end < 0 ? start + 12000 : end) : wikitext;
  const required = [evolution.fromName];
  if (evolution.method === "level" && evolution.level != null) required.push(`Level ${evolution.level}`);
  if (evolution.method === "item") required.push(evolution.item);
  if (evolution.friendship != null && !/friendship/i.test(section)) required.push("Friendship");
  if (/Beauty/i.test(evolution.condition ?? "")) required.push("Beauty");
  if (evolution.heldItem) required.push(evolution.heldItem);
  if (evolution.method === "trade" && !/\b(?:Trade|traded)\b/i.test(section)) {
    throw new Error(`Trade evolution is not present in Bulbapedia Evolution data for ${pokemonName}`);
  }
  for (const text of required) {
    if (!section.includes(text)) throw new Error(`Evolution value "${text}" is not present in Bulbapedia Evolution data for ${pokemonName}`);
  }
}

const masterWikitext = await getPageWikitext("List of Pokémon by availability");
const rows = parseMasterRows(masterWikitext);
const kantoSpecies = JSON.parse(await readFile(path.join(OUTPUT_DIR, "kanto-species.json"), "utf8"));
const johtoHoennSpecies = JSON.parse(await readFile(path.join(OUTPUT_DIR, "johto-hoenn-species.json"), "utf8"));
const generationSpecies = [...kantoSpecies, ...johtoHoennSpecies].filter((species) => species.nationalDex <= CONFIG.endDex);
const speciesByDex = new Map(generationSpecies.map((species) => [species.nationalDex, species]));
const incomingEvolution = new Map();
for (const species of generationSpecies) {
  for (const evolution of species.evolutions) incomingEvolution.set(evolution.toNationalDex, { parent: species, evolution });
}

const GEN2_EVOLUTION_OVERRIDES = new Map([
  [169, { method: "level", friendship: 220 }],
  [176, { method: "level", friendship: 220 }],
  [182, { method: "item", item: "Sun Stone" }],
  [186, { method: "trade", heldItem: "King's Rock" }],
  [196, { method: "level", friendship: 220, timeOfDay: "day" }],
  [197, { method: "level", friendship: 220, timeOfDay: "night" }],
  [199, { method: "trade", heldItem: "King's Rock" }],
  [208, { method: "trade", heldItem: "Metal Coat" }],
  [212, { method: "trade", heldItem: "Metal Coat" }],
  [230, { method: "trade", heldItem: "Dragon Scale" }],
  [233, { method: "trade", heldItem: "Upgrade" }],
  [237, { method: "level", level: 20, condition: "Attack equals Defense" }],
  [242, { method: "level", friendship: 220 }],
]);

const GEN3_EVOLUTION_OVERRIDES = new Map([
  [266, { method: "level", level: 7, condition: "personality value determines Silcoon" }],
  [268, { method: "level", level: 7, condition: "personality value determines Cascoon" }],
  [292, { method: "level", level: 20, condition: "a spare slot is present in the party" }],
  [350, { method: "level", condition: "Beauty is at least 170" }],
  [367, { method: "trade", heldItem: "Deep Sea Tooth" }],
  [368, { method: "trade", heldItem: "Deep Sea Scale" }],
]);

const data = [];
const audit = [];
for (const row of rows) {
  const pageTitle = `${row.name} (Pokémon)`;
  const wikitext = await getPageWikitext(pageTitle);
  let entries;
  try {
    entries = getGenerationLocationEntries(wikitext);
  } catch (error) {
    throw new Error(`Failed to parse #${row.nationalDex} ${row.name}: ${error.message}`);
  }
  const areas = Object.fromEntries(VERSION_KEYS.map((key) => [key, []]));
  for (const entry of entries) {
    for (const version of entryVersions(entry)) areas[version].push(entry.named.area ?? "");
  }

  const versions = {};
  for (let index = 0; index < VERSION_KEYS.length; index += 1) {
    const key = VERSION_KEYS[index];
    const code = row.codes[index];
    const segments = areas[key].flatMap(splitBreaks);
    const acquisitionMethods = segments.length ? segments.flatMap((segment) => classifySegment(segment, code)) : fallbackMethods(code);
    versions[key] = { availabilityCode: code, acquisitionMethods };
    audit.push({ dex: row.nationalDex, name: row.name, version: key, code, rawAreas: areas[key], acquisitionMethods });
  }

  const incoming = incomingEvolution.get(row.nationalDex);
  const targetSpecies = speciesByDex.get(row.nationalDex);
  const parentDex = targetSpecies?.evolvesFrom;
  const parent = incoming?.parent ?? (parentDex && parentDex <= CONFIG.endDex ? speciesByDex.get(parentDex) : null);
  const override = GENERATION === 2
    ? GEN2_EVOLUTION_OVERRIDES.get(row.nationalDex)
    : GENERATION === 3
      ? GEN3_EVOLUTION_OVERRIDES.get(row.nationalDex)
      : null;
  const evolution = parent && (incoming || override) ? {
    fromNationalDex: parent.nationalDex,
    fromName: parent.nameEn,
    ...(override ?? {
      method: incoming.evolution.method === "level-up" ? "level" : incoming.evolution.method === "use-item" ? "item" : incoming.evolution.method,
      ...(incoming.evolution.minLevel == null ? {} : { level: incoming.evolution.minLevel }),
      ...(incoming.evolution.item == null ? {} : { item: titleCaseItem(incoming.evolution.item) }),
      ...(incoming.evolution.triggerDetail == null ? {} : { condition: incoming.evolution.triggerDetail }),
    }),
  } : null;
  validateEvolutionAgainstBulbapedia(wikitext, evolution, row.name);

  for (const version of Object.values(versions)) {
    for (const method of version.acquisitionMethods) {
      if (method.label === "evolution") method.notes = describeEvolution(evolution);
    }
  }

  data.push({ nationalDex: row.nationalDex, name: row.name, versions, evolution, sourceUrl: sourceUrl(row.name) });
}

const categoryLabels = ["gift", "starter", "static", "game_corner", "fossil", "event"];
const allowedLabels = new Set(["wild_walk", "surf", "dive", "fishing", "old_rod", "good_rod", "super_rod", "headbutt", "rock_smash", "roaming", "swarm", "static", "starter", "gift", "breeding", "evolution", "trade", "game_corner", "fossil", "event", "unavailable"]);
const wildLabels = new Set(["wild_walk", "surf", "dive", "fishing", "old_rod", "good_rod", "super_rod", "headbutt", "rock_smash", "roaming", "swarm"]);

const expectedRecordCount = CONFIG.endDex - CONFIG.startDex + 1;
if (data.length !== expectedRecordCount) throw new Error(`Expected ${expectedRecordCount} records, got ${data.length}`);
for (const [index, record] of data.entries()) {
  const expectedDex = CONFIG.startDex + index;
  if (record.nationalDex !== expectedDex) throw new Error(`Missing or out-of-order National Dex #${expectedDex}`);
  if (Object.keys(record.versions).join("|") !== VERSION_KEYS.join("|")) throw new Error(`Version keys are invalid for #${record.nationalDex}`);
  if (!record.sourceUrl.endsWith("_(Pok%C3%A9mon)")) throw new Error(`Invalid sourceUrl for #${record.nationalDex}`);
  for (const version of VERSION_KEYS) {
    const value = record.versions[version];
    if (!value.acquisitionMethods.length) throw new Error(`No acquisition method for #${record.nationalDex} ${version}`);
    for (const method of value.acquisitionMethods) {
      if (!allowedLabels.has(method.label)) throw new Error(`Invalid label ${method.label} for #${record.nationalDex} ${version}`);
      if (wildLabels.has(method.label) && !method.locations.length) throw new Error(`Wild method without a location for #${record.nationalDex} ${version}`);
      if (!method.notes) throw new Error(`Missing notes for #${record.nationalDex} ${version}`);
      if (method.notes.includes("{{") || method.notes.includes("[[")) throw new Error(`Unrendered wiki markup in notes for #${record.nationalDex} ${version}`);
    }
  }
}

for (const batch of BATCHES) {
  const records = data.filter((record) => record.nationalDex >= batch.start && record.nationalDex <= batch.end);
  await writeFile(path.join(OUTPUT_DIR, batch.file), `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

const statistics = {};
for (const version of VERSION_KEYS) {
  const methodsFor = (record) => record.versions[version].acquisitionMethods.map((method) => method.label);
  statistics[version] = {
    wildEncounter: data.filter((record) => methodsFor(record).some((label) => wildLabels.has(label))).length,
    evolutionOnly: data.filter((record) => methodsFor(record).length > 0 && methodsFor(record).every((label) => label === "evolution")).length,
    breeding: data.filter((record) => methodsFor(record).includes("breeding")).length,
    trade: data.filter((record) => methodsFor(record).includes("trade")).length,
    giftStarterStaticGameCornerFossilEvent: data.filter((record) => methodsFor(record).some((label) => categoryLabels.includes(label))).length,
    completelyUnobtainable: data.filter((record) => methodsFor(record).every((label) => label === "unavailable")).length,
    byMethod: Object.fromEntries(["wild_walk", "surf", "dive", "fishing", "old_rod", "good_rod", "super_rod", "headbutt", "rock_smash", "roaming", "swarm", "static", "starter", "gift", "breeding", "evolution", "trade", "game_corner", "fossil", "event", "unavailable"].map((label) => [label, data.filter((record) => methodsFor(record).includes(label)).length])),
  };
}
await writeFile(path.join(OUTPUT_DIR, CONFIG.statisticsFile), `${JSON.stringify(statistics, null, 2)}\n`, "utf8");
await writeFile(path.join(CACHE_DIR, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ records: data.length, statistics }, null, 2));
