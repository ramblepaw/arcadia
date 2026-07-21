// One-time data pipeline for the Pokemon Breeder game. Run manually:
//   node server/scripts/build-pokedex.mjs
// Fetches the national dex (+ regional forms) from PokeAPI and writes
// pokedex.json + sprite images into data/pokemon-breeder/, which is
// git-ignored and lives in the same volume-mounted data/ dir as the SQLite
// DB (see server/src/db.js) so it never gets committed and survives
// container recreates. Safe to re-run - raw API responses and already-
// downloaded sprites are cached on disk, so an interrupted run resumes
// instead of restarting from scratch.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(__dirname, "..", "..", "data", "pokemon-breeder");
const cacheDir = path.join(dataRoot, ".cache");
const spritesDir = path.join(dataRoot, "sprites");
const outFile = path.join(dataRoot, "pokedex.json");

const API = "https://pokeapi.co/api/v2";
const CONCURRENCY = 8;

// Regional forms are real, distinct breeding-relevant species variants.
// Battle-only/cosmetic forms (mega, gmax, formes like therian/origin/etc.)
// always resolve back to the same base species when bred anyway, so they're
// skipped to keep the roster to forms that matter for breeding.
const REGIONAL_SUFFIXES = ["alola", "galar", "hisui", "paldea"];
const EXCLUDE_SUBSTRINGS = ["-mega", "-gmax", "-gigantamax", "-primal", "-eternamax", "-totem", "-starter"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchJsonWithRetry(url, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await sleep(2000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(500 * (i + 1));
    }
  }
}

async function cachedFetchJson(url, cacheKey) {
  const cachePath = path.join(cacheDir, `${cacheKey}.json`);
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    // not cached yet
  }
  const json = await fetchJsonWithRetry(url);
  await fs.writeFile(cachePath, JSON.stringify(json));
  return json;
}

async function downloadSprite(url, destPath) {
  try {
    await fs.access(destPath);
    return true; // already downloaded
  } catch {
    // need to fetch
  }
  if (!url) return false;
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buf);
  return true;
}

async function runPool(items, worker, label) {
  let idx = 0;
  let done = 0;
  const errors = [];
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      try {
        await worker(items[i]);
      } catch (err) {
        errors.push({ item: items[i], message: err.message });
      }
      done++;
      if (done % 25 === 0 || done === items.length) {
        process.stdout.write(`\r  [${label}] ${done}/${items.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
  process.stdout.write("\n");
  if (errors.length) {
    console.warn(`  ${errors.length} error(s) in ${label}, e.g.:`, errors.slice(0, 5));
  }
  return errors;
}

function displayNameFromKey(key) {
  return key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function keepVariety(varietyName, isDefault) {
  if (isDefault) return true;
  if (EXCLUDE_SUBSTRINGS.some((s) => varietyName.includes(s))) return false;
  return REGIONAL_SUFFIXES.some((suf) => varietyName.endsWith(`-${suf}`));
}

async function main() {
  const start = Date.now();
  await ensureDir(cacheDir);
  await ensureDir(spritesDir);

  console.log("Fetching species list...");
  const speciesList = await fetchJsonWithRetry(`${API}/pokemon-species?limit=100000`);
  console.log(`  ${speciesList.results.length} species total`);

  console.log("Fetching species detail...");
  const speciesByName = new Map();
  await runPool(
    speciesList.results,
    async (entry) => {
      const detail = await cachedFetchJson(entry.url, `species-${entry.name}`);
      speciesByName.set(entry.name, detail);
    },
    "species"
  );

  // Resolve, for every species, the root (base evolution stage) species name -
  // this is what a bred egg always hatches as, regardless of which evolution
  // stage or form the parents were.
  function rootSpeciesName(name, seen = new Set()) {
    if (seen.has(name)) return name; // guard against bad data cycles
    seen.add(name);
    const species = speciesByName.get(name);
    if (!species || !species.evolves_from_species) return name;
    return rootSpeciesName(species.evolves_from_species.name, seen);
  }

  function defaultVarietyKey(species) {
    const def = species.varieties.find((v) => v.is_default) || species.varieties[0];
    return def.pokemon.name;
  }

  // Collect the (species, variety) pairs we're actually keeping.
  const varietyJobs = [];
  for (const species of speciesByName.values()) {
    for (const variety of species.varieties) {
      if (!keepVariety(variety.pokemon.name, variety.is_default)) continue;
      varietyJobs.push({ species, variety });
    }
  }
  console.log(`Keeping ${varietyJobs.length} species+form entries`);

  console.log("Fetching pokemon (form) detail...");
  const pokemonByVarietyName = new Map();
  await runPool(
    varietyJobs,
    async ({ variety }) => {
      const detail = await cachedFetchJson(variety.pokemon.url, `pokemon-${variety.pokemon.name}`);
      pokemonByVarietyName.set(variety.pokemon.name, detail);
    },
    "pokemon"
  );

  console.log("Downloading sprites...");
  await runPool(
    varietyJobs,
    async ({ variety }) => {
      const pokemon = pokemonByVarietyName.get(variety.pokemon.name);
      if (!pokemon) return;
      const artwork = pokemon.sprites?.other?.["official-artwork"];
      const spriteUrl = artwork?.front_default || pokemon.sprites?.front_default;
      const shinyUrl = artwork?.front_shiny || pokemon.sprites?.front_shiny || spriteUrl;
      if (spriteUrl) await downloadSprite(spriteUrl, path.join(spritesDir, `${variety.pokemon.name}.png`));
      if (shinyUrl) await downloadSprite(shinyUrl, path.join(spritesDir, `${variety.pokemon.name}-shiny.png`));
    },
    "sprites"
  );

  console.log("Assembling pokedex.json...");
  const entries = {};
  let skipped = 0;
  for (const { species, variety } of varietyJobs) {
    const pokemon = pokemonByVarietyName.get(variety.pokemon.name);
    if (!pokemon) {
      skipped++;
      continue;
    }
    const root = speciesByName.get(rootSpeciesName(species.name));
    const englishName = species.names?.find((n) => n.language.name === "en")?.name || displayNameFromKey(species.name);

    const stats = {};
    for (const s of pokemon.stats) {
      stats[s.stat.name] = s.base_stat;
    }

    entries[variety.pokemon.name] = {
      speciesKey: species.name,
      name: variety.is_default ? englishName : `${englishName} (${displayNameFromKey(variety.pokemon.name.replace(`${species.name}-`, ""))})`,
      isDefaultForm: variety.is_default,
      types: [...pokemon.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
      baseStats: {
        hp: stats.hp,
        attack: stats.attack,
        defense: stats.defense,
        specialAttack: stats["special-attack"],
        specialDefense: stats["special-defense"],
        speed: stats.speed,
      },
      eggGroups: species.egg_groups.map((g) => g.name),
      genderRate: species.gender_rate, // -1 genderless, else eighths female (0-8)
      hatchCounter: species.hatch_counter,
      hatchesFrom: defaultVarietyKey(root),
      sprite: `${variety.pokemon.name}.png`,
      shinySprite: `${variety.pokemon.name}-shiny.png`,
    };
  }

  const pokedex = {
    generatedAt: new Date().toISOString(),
    entryCount: Object.keys(entries).length,
    entries,
  };
  await fs.writeFile(outFile, JSON.stringify(pokedex));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s. Wrote ${pokedex.entryCount} entries (${skipped} skipped) to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
