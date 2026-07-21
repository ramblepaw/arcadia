// Tunable game-design constants for the Pokemon Breeder game. Kept separate
// from fetched dex data (server/scripts/build-pokedex.mjs) so balance can be
// retuned without re-running the data pipeline.

export const STARTING_CURRENCY = 500;
export const STARTER_PEN_BIOME = "grassland";

// Biomes double as pen themes and exploration location themes. Mapping is
// derived from a species' primary type - not authentic per-game habitat
// data, which doesn't exist as a clean reusable set (documented v1
// simplification).
export const BIOMES = ["grassland", "forest", "water", "mountain", "desert", "urban"];

export const TYPE_TO_BIOME = {
  normal: "grassland",
  grass: "grassland",
  fairy: "grassland",
  bug: "forest",
  flying: "forest",
  poison: "forest",
  water: "water",
  ice: "water",
  dragon: "water",
  rock: "mountain",
  ground: "mountain",
  fighting: "mountain",
  steel: "mountain",
  fire: "desert",
  ghost: "desert",
  dark: "desert",
  electric: "urban",
  psychic: "urban",
};

export function biomeForTypes(types) {
  return TYPE_TO_BIOME[types[0]] || "grassland";
}

// Pen construction cost scales with how many pens are already built.
export const PEN_BASE_COST = 300;
export const PEN_COST_STEP = 200;
export function penCost(existingPenCount) {
  return PEN_BASE_COST + PEN_COST_STEP * existingPenCount;
}

// Happiness / care.
export const HAPPINESS_MAX = 100;
export const HAPPINESS_ELIGIBLE = 80;
export const HAPPINESS_PER_SECOND_HOUSED = 3 / 3600; // +3/hr while in a matching-biome pen
export const FEED_COST = 50;
export const FEED_HAPPINESS_BOOST = 20;
export const FEED_COOLDOWN_SECONDS = 30 * 60;

// Egg appearance: once both parents in a pen are eligible, roll every
// EGG_CHECK_INTERVAL_SECONDS of elapsed real time for a chance an egg
// appears, at a rate depending on parent compatibility. Approximate stand-
// ins for the real games' odds (v1 simplification).
export const EGG_CHECK_INTERVAL_SECONDS = 5 * 60;
export const EGG_CHANCE_SAME_SPECIES = 0.2;
export const EGG_CHANCE_SAME_EGG_GROUP = 0.1;
export const EGG_CHANCE_DITTO = 0.05;

// Hatching: real hatch_counter (egg cycles) * 255 = steps, 1 step = 1 real
// second (same conversion the original idle-only plan used).
export const STEPS_PER_CYCLE = 255;
export const SECONDS_PER_STEP = 1;

// Shiny odds: base is the real base rate; boosted to the real Masuda-method
// rate when the two parents' most recent origin locations differ.
export const SHINY_DENOM_BASE = 4096;
export const SHINY_DENOM_MASUDA = 683;

export const NATURES = [
  "Hardy", "Lonely", "Brave", "Adamant", "Naughty",
  "Bold", "Docile", "Relaxed", "Impish", "Lax",
  "Timid", "Hasty", "Serious", "Jolly", "Naive",
  "Modest", "Mild", "Quiet", "Bashful", "Rash",
  "Calm", "Gentle", "Sassy", "Careful", "Quirky",
];

export const UNDISCOVERED_EGG_GROUP = "no-eggs";
export const DITTO_EGG_GROUP = "ditto";
export const DITTO_SPECIES_KEY = "ditto";

// A lazy-tick never simulates more than this much elapsed time at once, so a
// long absence can't produce a pathological backlog to compute in one go.
export const MAX_TICK_SECONDS = 48 * 60 * 60;

// Exploration is now active: stepping onto a "resource" tile in the
// overworld (see pbRegions.js) rolls once immediately via POST /interact,
// rather than passively over elapsed time.
export const INTERACT_COOLDOWN_SECONDS = 3;
export const INTERACT_ENCOUNTER_CHANCE = 0.22;
export const INTERACT_ITEM_CHANCE = 0.1;

// Global shop / request board refresh cadence and sizing.
export const SHOP_REFRESH_INTERVAL_SECONDS = 6 * 60 * 60;
export const SHOP_SIZE = 6;
export const REQUEST_REFRESH_INTERVAL_SECONDS = 12 * 60 * 60;
export const REQUEST_BOARD_SIZE = 5;

export const RECENT_EVENTS_MAX = 20;
