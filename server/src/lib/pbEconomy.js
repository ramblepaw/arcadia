import { getEntry, randomSpeciesKey } from "./pbDex.js";
import { rollGender, rollShiny, randomIVs, ivTotal, STAT_KEYS } from "./pbBreeding.js";
import { NATURES } from "./pbConstants.js";

export function priceForPokemon({ ivs, isShiny, baseStats }) {
  const bst = Object.values(baseStats).reduce((a, b) => a + b, 0);
  let price = 50 + Math.round(ivTotal(ivs) * 2) + Math.round(bst * 0.5);
  if (isShiny) price *= 5;
  return price;
}

export function generateShopListing() {
  const speciesKey = randomSpeciesKey();
  const entry = getEntry(speciesKey);
  const ivs = randomIVs();
  const isShiny = rollShiny(false);
  return {
    speciesKey,
    gender: rollGender(entry.genderRate),
    nature: NATURES[Math.floor(Math.random() * NATURES.length)],
    ivs,
    isShiny,
    price: priceForPokemon({ ivs, isShiny, baseStats: entry.baseStats }),
  };
}

const IV_TOTAL_TIERS = [40, 70, 100, 130];

export function generateRequest() {
  const speciesKey = randomSpeciesKey();
  const entry = getEntry(speciesKey);
  const shinyRequired = Math.random() < 0.05;
  const minIvTotal = shinyRequired ? 0 : IV_TOTAL_TIERS[Math.floor(Math.random() * IV_TOTAL_TIERS.length)];
  const genderRequired = entry.genderRate === -1 || Math.random() >= 0.4
    ? null
    : Math.random() < 0.5 ? "male" : "female";
  const natureRequired = Math.random() < 0.3 ? NATURES[Math.floor(Math.random() * NATURES.length)] : null;

  let reward = 100 + minIvTotal * 3;
  if (shinyRequired) reward += 2000;
  if (natureRequired) reward += 150;
  if (genderRequired) reward += 50;

  return {
    speciesKey,
    criteria: { minIvTotal, shinyRequired, genderRequired, natureRequired },
    reward,
  };
}

export function pokemonMatchesCriteria(pokemon, criteria) {
  if (criteria.shinyRequired && !pokemon.is_shiny) return false;
  if (criteria.genderRequired && pokemon.gender !== criteria.genderRequired) return false;
  if (criteria.natureRequired && pokemon.nature !== criteria.natureRequired) return false;
  if (ivTotal(JSON.parse(pokemon.ivs)) < criteria.minIvTotal) return false;
  return true;
}

export { STAT_KEYS };
