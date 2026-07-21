// Core breeding math: compatibility, IV/nature/gender/shiny inheritance,
// species/hatch resolution. All real-mechanic-accurate per the approved
// plan's "real mechanics, accurate odds" scope, with documented v1
// simplifications (no ability inheritance, Masuda-equivalent via origin
// location instead of trainer ID, form inheritance simplified to the
// family's default form).
import { getEntry } from "./pbDex.js";
import {
  NATURES,
  DITTO_SPECIES_KEY,
  UNDISCOVERED_EGG_GROUP,
  SHINY_DENOM_BASE,
  SHINY_DENOM_MASUDA,
  STEPS_PER_CYCLE,
  EGG_CHANCE_SAME_SPECIES,
  EGG_CHANCE_SAME_EGG_GROUP,
  EGG_CHANCE_DITTO,
} from "./pbConstants.js";

export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

export function randomIVs() {
  const ivs = {};
  for (const k of STAT_KEYS) ivs[k] = Math.floor(Math.random() * 32);
  return ivs;
}

export function ivTotal(ivs) {
  return STAT_KEYS.reduce((sum, k) => sum + (ivs[k] || 0), 0);
}

export function rollGender(genderRate) {
  if (genderRate === -1) return "genderless";
  return Math.random() < genderRate / 8 ? "female" : "male";
}

export function rollShiny(differentOrigin) {
  const denom = differentOrigin ? SHINY_DENOM_MASUDA : SHINY_DENOM_BASE;
  return Math.floor(Math.random() * denom) === 0;
}

function shuffledStatKeys() {
  const keys = [...STAT_KEYS];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

export function rollOffspringIVs(parentAIvs, parentBIvs, hasDestinyKnot) {
  const inheritCount = hasDestinyKnot ? 5 : 3;
  const ivs = randomIVs();
  for (const slot of shuffledStatKeys().slice(0, inheritCount)) {
    ivs[slot] = Math.random() < 0.5 ? parentAIvs[slot] : parentBIvs[slot];
  }
  return ivs;
}

export function rollOffspringNature({ natureA, itemA, natureB, itemB }) {
  const aLocks = itemA === "everstone";
  const bLocks = itemB === "everstone";
  if ((aLocks || bLocks) && Math.random() < 0.5) {
    if (aLocks && bLocks) return Math.random() < 0.5 ? natureA : natureB;
    return aLocks ? natureA : natureB;
  }
  return NATURES[Math.floor(Math.random() * NATURES.length)];
}

// Compatibility between two parents. genderA/genderB are the actual instance
// genders (male/female/genderless), not the species' gender ratio.
export function checkCompatibility({ entryA, keyA, genderA, entryB, keyB, genderB }) {
  const aIsDitto = keyA === DITTO_SPECIES_KEY;
  const bIsDitto = keyB === DITTO_SPECIES_KEY;
  if (aIsDitto && bIsDitto) {
    return { compatible: false, reason: "Two Ditto can't breed with each other." };
  }
  if (entryA.eggGroups.includes(UNDISCOVERED_EGG_GROUP) || entryB.eggGroups.includes(UNDISCOVERED_EGG_GROUP)) {
    return { compatible: false, reason: "One of these can't breed at all." };
  }
  if (aIsDitto || bIsDitto) {
    return { compatible: true, tier: "ditto" };
  }
  if (genderA === "genderless" || genderB === "genderless") {
    return { compatible: false, reason: "Genderless Pokemon can only breed with Ditto." };
  }
  if (genderA === genderB) {
    return { compatible: false, reason: "Breeding pairs need one male and one female." };
  }
  if (!entryA.eggGroups.some((g) => entryB.eggGroups.includes(g))) {
    return { compatible: false, reason: "These don't share an egg group." };
  }
  return { compatible: true, tier: keyA === keyB ? "same-species" : "same-group" };
}

export function eggChanceForTier(tier) {
  if (tier === "same-species") return EGG_CHANCE_SAME_SPECIES;
  if (tier === "ditto") return EGG_CHANCE_DITTO;
  return EGG_CHANCE_SAME_EGG_GROUP;
}

// Species always follows the mother; if one parent is Ditto (always
// genderless, never the mother), species follows the other parent instead.
function speciesSourceKey({ keyA, genderA, keyB, genderB }) {
  if (keyA === DITTO_SPECIES_KEY) return keyB;
  if (keyB === DITTO_SPECIES_KEY) return keyA;
  return genderA === "female" ? keyA : keyB;
}

// Builds the rolled fields for a brand-new egg from two eligible, compatible
// parent DB rows (expects .species_key, .gender, .nature, .held_item, .ivs
// (JSON string), .origin_location).
export function createEggFields({ parentA, parentB }) {
  const sourceKey = speciesSourceKey({
    keyA: parentA.species_key,
    genderA: parentA.gender,
    keyB: parentB.species_key,
    genderB: parentB.gender,
  });
  const sourceEntry = getEntry(sourceKey);
  const hatchSpeciesKey = sourceEntry.hatchesFrom;
  const hatchEntry = getEntry(hatchSpeciesKey);

  const destinyKnot = parentA.held_item === "destiny-knot" || parentB.held_item === "destiny-knot";
  const ivs = rollOffspringIVs(JSON.parse(parentA.ivs), JSON.parse(parentB.ivs), destinyKnot);
  const nature = rollOffspringNature({
    natureA: parentA.nature,
    itemA: parentA.held_item,
    natureB: parentB.nature,
    itemB: parentB.held_item,
  });
  const gender = rollGender(hatchEntry.genderRate);
  const differentOrigin = Boolean(
    parentA.origin_location && parentB.origin_location && parentA.origin_location !== parentB.origin_location
  );
  const isShiny = rollShiny(differentOrigin);
  const stepsRequired = hatchEntry.hatchCounter * STEPS_PER_CYCLE;

  return { speciesKey: hatchSpeciesKey, gender, nature, ivs, isShiny, stepsRequired };
}
