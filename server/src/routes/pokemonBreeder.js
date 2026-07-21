import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { isDexReady, getEntry, biomeForEntry, randomSpeciesKeyForBiome, randomSpeciesKey } from "../lib/pbDex.js";
import { loadLocations, getLocation } from "../lib/pbLocations.js";
import {
  checkCompatibility,
  eggChanceForTier,
  createEggFields,
  rollGender,
  rollShiny,
  randomIVs,
} from "../lib/pbBreeding.js";
import { priceForPokemon, generateShopListing, generateRequest, pokemonMatchesCriteria } from "../lib/pbEconomy.js";
import {
  STARTING_CURRENCY,
  STARTER_PEN_BIOME,
  BIOMES,
  NATURES,
  penCost,
  HAPPINESS_MAX,
  HAPPINESS_ELIGIBLE,
  HAPPINESS_PER_SECOND_HOUSED,
  FEED_COST,
  FEED_HAPPINESS_BOOST,
  FEED_COOLDOWN_SECONDS,
  EGG_CHECK_INTERVAL_SECONDS,
  ENCOUNTER_CHECK_INTERVAL_SECONDS,
  ENCOUNTER_CHANCE,
  MAX_TICK_SECONDS,
  SHOP_REFRESH_INTERVAL_SECONDS,
  SHOP_SIZE,
  REQUEST_REFRESH_INTERVAL_SECONDS,
  REQUEST_BOARD_SIZE,
  RECENT_EVENTS_MAX,
  UNDISCOVERED_EGG_GROUP,
} from "../lib/pbConstants.js";

export const pokemonBreederRouter = Router();

const HELD_ITEMS = ["everstone", "destiny-knot"];
const HELD_ITEM_LABELS = { everstone: "Everstone", "destiny-knot": "Destiny Knot" };

pokemonBreederRouter.use(requireAuth);
pokemonBreederRouter.use((req, res, next) => {
  if (!isDexReady()) {
    return res.status(503).json({ error: "Ranch data not initialized yet - ask the admin to run the pokedex build script." });
  }
  next();
});

// --- small helpers -------------------------------------------------------

function randomNature() {
  return NATURES[Math.floor(Math.random() * NATURES.length)];
}

function spriteUrl(entry, isShiny) {
  if (!entry) return null;
  return `/pokemon-breeder-assets/sprites/${isShiny ? entry.shinySprite : entry.sprite}`;
}

function dexName(speciesKey) {
  return getEntry(speciesKey)?.name || speciesKey;
}

function insertPokemon(userId, { speciesKey, gender, nature, ivs, isShiny, origin, originLocation }) {
  const info = db.prepare(`
    INSERT INTO pb_pokemon (user_id, species_key, gender, nature, ivs, is_shiny, origin, origin_location, happiness)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(userId, speciesKey, gender, nature, JSON.stringify(ivs), isShiny ? 1 : 0, origin, originLocation || null);
  return info.lastInsertRowid;
}

function rollNewIndividual(speciesKey, forcedGender) {
  const entry = getEntry(speciesKey);
  return {
    speciesKey,
    gender: forcedGender || rollGender(entry.genderRate),
    nature: randomNature(),
    ivs: randomIVs(),
    isShiny: rollShiny(false),
  };
}

function pushEvent(userId, text) {
  const row = db.prepare("SELECT recent_events FROM pb_state WHERE user_id = ?").get(userId);
  if (!row) return;
  const events = JSON.parse(row.recent_events);
  events.unshift({ text, at: new Date().toISOString() });
  db.prepare("UPDATE pb_state SET recent_events = ? WHERE user_id = ?")
    .run(JSON.stringify(events.slice(0, RECENT_EVENTS_MAX)), userId);
}

function addInventoryItem(userId, item, qty) {
  const row = db.prepare("SELECT inventory FROM pb_state WHERE user_id = ?").get(userId);
  const inventory = JSON.parse(row.inventory);
  inventory[item] = (inventory[item] || 0) + qty;
  db.prepare("UPDATE pb_state SET inventory = ? WHERE user_id = ?").run(JSON.stringify(inventory), userId);
}

// Reuses the existing plays/leaderboard infra for an optional "Dex
// Completion" leaderboard - only records a new play when distinct species
// owned or shiny count actually increases, not on every acquisition.
function recordDexProgressIfNeeded(userId) {
  const distinctSpecies = db.prepare("SELECT COUNT(DISTINCT species_key) AS c FROM pb_pokemon WHERE user_id = ?").get(userId).c;
  const shinyCount = db.prepare("SELECT COUNT(*) AS c FROM pb_pokemon WHERE user_id = ? AND is_shiny = 1").get(userId).c;
  const last = db.prepare(`
    SELECT details FROM plays WHERE user_id = ? AND game_slug = 'pokemon-breeder' ORDER BY id DESC LIMIT 1
  `).get(userId);
  const lastDetails = last ? JSON.parse(last.details) : { distinctSpecies: 0, shinyCount: 0 };
  if (distinctSpecies > lastDetails.distinctSpecies || shinyCount > lastDetails.shinyCount) {
    db.prepare(`
      INSERT INTO plays (user_id, game_slug, score, result, details) VALUES (?, 'pokemon-breeder', ?, NULL, ?)
    `).run(userId, distinctSpecies, JSON.stringify({ distinctSpecies, shinyCount }));
  }
}

function pickBreedableBiomeSpecies(biome, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const key = randomSpeciesKeyForBiome(biome);
    if (!key) return null;
    const entry = getEntry(key);
    if (entry.genderRate >= 1 && entry.genderRate <= 7 && !entry.eggGroups.includes(UNDISCOVERED_EGG_GROUP)) {
      return key;
    }
  }
  return null;
}

function grantStarters(userId) {
  const speciesKey = pickBreedableBiomeSpecies(STARTER_PEN_BIOME) || randomSpeciesKey();
  for (const gender of ["male", "female"]) {
    const individual = rollNewIndividual(speciesKey, gender);
    insertPokemon(userId, { ...individual, origin: "starter", originLocation: null });
  }
}

function ensurePlayerState(userId) {
  let state = db.prepare("SELECT * FROM pb_state WHERE user_id = ?").get(userId);
  if (state) return state;
  db.prepare("INSERT INTO pb_state (user_id, currency) VALUES (?, ?)").run(userId, STARTING_CURRENCY);
  db.prepare("INSERT INTO pb_pens (user_id, biome) VALUES (?, ?)").run(userId, STARTER_PEN_BIOME);
  grantStarters(userId);
  recordDexProgressIfNeeded(userId);
  return db.prepare("SELECT * FROM pb_state WHERE user_id = ?").get(userId);
}

function ensureGlobalShopAndRequests() {
  if (!db.prepare("SELECT 1 FROM pb_shop_state WHERE singleton_id = 1").get()) {
    db.prepare("INSERT INTO pb_shop_state (singleton_id, last_refreshed_at) VALUES (1, '1970-01-01 00:00:00')").run();
  }
  if (!db.prepare("SELECT 1 FROM pb_request_state WHERE singleton_id = 1").get()) {
    db.prepare("INSERT INTO pb_request_state (singleton_id, last_refreshed_at) VALUES (1, '1970-01-01 00:00:00')").run();
  }

  const shopElapsed = db.prepare(`
    SELECT (julianday('now') - julianday(last_refreshed_at)) * 86400 AS s FROM pb_shop_state WHERE singleton_id = 1
  `).get().s;
  const shopCount = db.prepare("SELECT COUNT(*) AS c FROM pb_shop").get().c;
  if (shopElapsed >= SHOP_REFRESH_INTERVAL_SECONDS || shopCount === 0) {
    db.prepare("DELETE FROM pb_shop").run();
    for (let i = 0; i < SHOP_SIZE; i++) {
      const listing = generateShopListing();
      db.prepare(`
        INSERT INTO pb_shop (species_key, gender, nature, ivs, is_shiny, price) VALUES (?, ?, ?, ?, ?, ?)
      `).run(listing.speciesKey, listing.gender, listing.nature, JSON.stringify(listing.ivs), listing.isShiny ? 1 : 0, listing.price);
    }
    db.prepare("UPDATE pb_shop_state SET last_refreshed_at = datetime('now') WHERE singleton_id = 1").run();
  }

  const reqElapsed = db.prepare(`
    SELECT (julianday('now') - julianday(last_refreshed_at)) * 86400 AS s FROM pb_request_state WHERE singleton_id = 1
  `).get().s;
  const openCount = db.prepare("SELECT COUNT(*) AS c FROM pb_requests WHERE fulfilled_at IS NULL").get().c;
  if (reqElapsed >= REQUEST_REFRESH_INTERVAL_SECONDS || openCount === 0) {
    const need = Math.max(0, REQUEST_BOARD_SIZE - openCount);
    for (let i = 0; i < need; i++) {
      const r = generateRequest();
      db.prepare("INSERT INTO pb_requests (species_key, criteria, reward) VALUES (?, ?, ?)")
        .run(r.speciesKey, JSON.stringify(r.criteria), r.reward);
    }
    db.prepare("UPDATE pb_request_state SET last_refreshed_at = datetime('now') WHERE singleton_id = 1").run();
  }
}

// --- the lazy tick ---------------------------------------------------------
// Advances happiness, egg appearance, hatching, and exploration by however
// much real time has passed since this user's state was last touched. Runs
// at the top of every route so progress is always current before a handler
// reads or mutates state - no background worker needed.
function runTick(userId) {
  ensureGlobalShopAndRequests();
  const state = ensurePlayerState(userId);

  const elapsedRaw = db.prepare(`
    SELECT (julianday('now') - julianday(last_tick_at)) * 86400 AS s FROM pb_state WHERE user_id = ?
  `).get(userId).s;
  const elapsed = Math.min(Math.max(elapsedRaw || 0, 0), MAX_TICK_SECONDS);

  const pens = db.prepare("SELECT * FROM pb_pens WHERE user_id = ?").all(userId);
  for (const pen of pens) {
    const occupants = db.prepare("SELECT * FROM pb_pokemon WHERE current_pen_id = ?").all(pen.id);

    for (const p of occupants) {
      if (p.happiness < HAPPINESS_MAX) {
        const newHappiness = Math.min(HAPPINESS_MAX, p.happiness + elapsed * HAPPINESS_PER_SECOND_HOUSED);
        db.prepare("UPDATE pb_pokemon SET happiness = ? WHERE id = ?").run(newHappiness, p.id);
        p.happiness = newHappiness;
      }
    }

    const egg = db.prepare("SELECT * FROM pb_pen_egg WHERE pen_id = ?").get(pen.id);
    const location = getLocation(state.current_location);

    if (egg) {
      const stepsGained = elapsed * (location ? location.stepMultiplier : 1);
      const newProgress = egg.progress_steps + stepsGained;
      if (newProgress >= egg.steps_required) {
        insertPokemon(userId, {
          speciesKey: egg.species_key,
          gender: egg.gender,
          nature: egg.nature,
          ivs: JSON.parse(egg.ivs),
          isShiny: !!egg.is_shiny,
          origin: "bred",
          originLocation: null,
        });
        db.prepare("DELETE FROM pb_pen_egg WHERE pen_id = ?").run(pen.id);
        pushEvent(userId, `An egg hatched into a ${dexName(egg.species_key)}!`);
        recordDexProgressIfNeeded(userId);
      } else {
        db.prepare("UPDATE pb_pen_egg SET progress_steps = ? WHERE pen_id = ?").run(newProgress, pen.id);
      }
    } else if (occupants.length === 2) {
      const [a, b] = occupants;
      if (a.happiness >= HAPPINESS_ELIGIBLE && b.happiness >= HAPPINESS_ELIGIBLE) {
        const entryA = getEntry(a.species_key);
        const entryB = getEntry(b.species_key);
        const compat = checkCompatibility({
          entryA, keyA: a.species_key, genderA: a.gender,
          entryB, keyB: b.species_key, genderB: b.gender,
        });
        if (compat.compatible) {
          const p = eggChanceForTier(compat.tier);
          const n = elapsed / EGG_CHECK_INTERVAL_SECONDS;
          const chance = 1 - Math.pow(1 - p, n);
          if (Math.random() < chance) {
            const fields = createEggFields({ parentA: a, parentB: b });
            db.prepare(`
              INSERT INTO pb_pen_egg (pen_id, species_key, gender, nature, ivs, is_shiny, progress_steps, steps_required)
              VALUES (?, ?, ?, ?, ?, ?, 0, ?)
            `).run(pen.id, fields.speciesKey, fields.gender, fields.nature, JSON.stringify(fields.ivs), fields.isShiny ? 1 : 0, fields.stepsRequired);
            pushEvent(userId, `An egg appeared in the ${pen.biome} pen!`);
          }
        }
      }
    }
  }

  const location = getLocation(state.current_location);
  if (location) {
    const n = elapsed / ENCOUNTER_CHECK_INTERVAL_SECONDS;
    const encounterChance = 1 - Math.pow(1 - ENCOUNTER_CHANCE, n);
    if (Math.random() < encounterChance) {
      const speciesKey = randomSpeciesKeyForBiome(location.biome) || randomSpeciesKey();
      const individual = rollNewIndividual(speciesKey);
      insertPokemon(userId, { ...individual, origin: "encounter", originLocation: location.slug });
      pushEvent(userId, `You found a wild ${dexName(speciesKey)} at ${location.name}!`);
      recordDexProgressIfNeeded(userId);
    }
    if (location.items.length) {
      const itemChance = 1 - Math.pow(1 - location.itemDropChance, n);
      if (Math.random() < itemChance) {
        const item = location.items[Math.floor(Math.random() * location.items.length)];
        addInventoryItem(userId, item, 1);
        pushEvent(userId, `You picked up a ${HELD_ITEM_LABELS[item]} at ${location.name}!`);
      }
    }
  }

  db.prepare("UPDATE pb_state SET last_tick_at = datetime('now') WHERE user_id = ?").run(userId);
}

// --- serialization ---------------------------------------------------------

function serializePokemon(p) {
  const entry = getEntry(p.species_key);
  return {
    id: p.id,
    speciesKey: p.species_key,
    name: entry?.name || p.species_key,
    sprite: spriteUrl(entry, !!p.is_shiny),
    types: entry?.types || [],
    biome: entry ? biomeForEntry(entry) : null,
    gender: p.gender,
    nature: p.nature,
    ivs: JSON.parse(p.ivs),
    isShiny: !!p.is_shiny,
    heldItem: p.held_item,
    origin: p.origin,
    happiness: Math.round(p.happiness),
    eligible: p.happiness >= HAPPINESS_ELIGIBLE,
    currentPenId: p.current_pen_id,
    onDisplay: !!p.on_display,
    obtainedAt: p.obtained_at,
  };
}

function serializeEgg(e) {
  // Species/shininess intentionally withheld until hatch, matching the real
  // games' "mystery egg" behavior.
  return {
    progressSteps: Math.round(e.progress_steps),
    stepsRequired: e.steps_required,
    createdAt: e.created_at,
  };
}

function buildStateResponse(userId) {
  const state = db.prepare("SELECT * FROM pb_state WHERE user_id = ?").get(userId);
  const pens = db.prepare("SELECT * FROM pb_pens WHERE user_id = ? ORDER BY id").all(userId);
  const pokemon = db.prepare("SELECT * FROM pb_pokemon WHERE user_id = ? ORDER BY id").all(userId);
  const eggs = new Map(
    db.prepare(`
      SELECT * FROM pb_pen_egg WHERE pen_id IN (SELECT id FROM pb_pens WHERE user_id = ?)
    `).all(userId).map((e) => [e.pen_id, e])
  );

  const occupantsByPen = new Map();
  const box = [];
  for (const p of pokemon) {
    if (p.current_pen_id) {
      if (!occupantsByPen.has(p.current_pen_id)) occupantsByPen.set(p.current_pen_id, []);
      occupantsByPen.get(p.current_pen_id).push(serializePokemon(p));
    } else {
      box.push(serializePokemon(p));
    }
  }

  return {
    currency: state.currency,
    currentLocation: state.current_location,
    inventory: JSON.parse(state.inventory),
    recentEvents: JSON.parse(state.recent_events),
    nextPenCost: penCost(pens.length),
    pens: pens.map((pen) => ({
      id: pen.id,
      biome: pen.biome,
      builtAt: pen.built_at,
      occupants: occupantsByPen.get(pen.id) || [],
      egg: eggs.has(pen.id) ? serializeEgg(eggs.get(pen.id)) : null,
    })),
    box,
  };
}

// --- routes ------------------------------------------------------------

pokemonBreederRouter.get("/state", (req, res) => {
  runTick(req.user.id);
  res.json(buildStateResponse(req.user.id));
});

pokemonBreederRouter.get("/locations", (req, res) => {
  res.json({ locations: loadLocations() });
});

pokemonBreederRouter.post("/travel", (req, res) => {
  runTick(req.user.id); // settle the old location before switching
  const { locationSlug } = req.body || {};
  if (!getLocation(locationSlug)) return res.status(400).json({ error: "Unknown location." });
  db.prepare("UPDATE pb_state SET current_location = ? WHERE user_id = ?").run(locationSlug, req.user.id);
  res.json(buildStateResponse(req.user.id));
});

pokemonBreederRouter.post("/pens", (req, res) => {
  runTick(req.user.id);
  const { biome } = req.body || {};
  if (!BIOMES.includes(biome)) return res.status(400).json({ error: "Invalid biome." });
  const state = db.prepare("SELECT currency FROM pb_state WHERE user_id = ?").get(req.user.id);
  const existingCount = db.prepare("SELECT COUNT(*) AS c FROM pb_pens WHERE user_id = ?").get(req.user.id).c;
  const cost = penCost(existingCount);
  if (state.currency < cost) return res.status(400).json({ error: "Not enough currency." });
  db.prepare("UPDATE pb_state SET currency = currency - ? WHERE user_id = ?").run(cost, req.user.id);
  db.prepare("INSERT INTO pb_pens (user_id, biome) VALUES (?, ?)").run(req.user.id, biome);
  res.status(201).json(buildStateResponse(req.user.id));
});

pokemonBreederRouter.post("/pens/:id/assign", (req, res) => {
  runTick(req.user.id);
  const penId = Number(req.params.id);
  const { pokemonId } = req.body || {};
  const pen = db.prepare("SELECT * FROM pb_pens WHERE id = ? AND user_id = ?").get(penId, req.user.id);
  if (!pen) return res.status(404).json({ error: "Pen not found." });
  const pokemon = db.prepare("SELECT * FROM pb_pokemon WHERE id = ? AND user_id = ?").get(pokemonId, req.user.id);
  if (!pokemon) return res.status(404).json({ error: "Pokemon not found." });
  if (pokemon.current_pen_id) return res.status(400).json({ error: "Already housed somewhere." });
  const occupantCount = db.prepare("SELECT COUNT(*) AS c FROM pb_pokemon WHERE current_pen_id = ?").get(penId).c;
  if (occupantCount >= 2) return res.status(400).json({ error: "This pen is full." });
  const entry = getEntry(pokemon.species_key);
  if (!entry || biomeForEntry(entry) !== pen.biome) {
    return res.status(400).json({ error: "This Pokemon's habitat doesn't match this pen." });
  }
  db.prepare("UPDATE pb_pokemon SET current_pen_id = ? WHERE id = ?").run(penId, pokemonId);
  res.json(buildStateResponse(req.user.id));
});

pokemonBreederRouter.post("/pens/:id/unassign", (req, res) => {
  runTick(req.user.id);
  const penId = Number(req.params.id);
  const { pokemonId } = req.body || {};
  const pokemon = db.prepare("SELECT * FROM pb_pokemon WHERE id = ? AND user_id = ? AND current_pen_id = ?")
    .get(pokemonId, req.user.id, penId);
  if (!pokemon) return res.status(404).json({ error: "That Pokemon isn't in this pen." });
  db.prepare("UPDATE pb_pokemon SET current_pen_id = NULL WHERE id = ?").run(pokemonId);
  res.json(buildStateResponse(req.user.id));
});

pokemonBreederRouter.post("/pokemon/:id/feed", (req, res) => {
  runTick(req.user.id);
  const id = Number(req.params.id);
  const pokemon = db.prepare("SELECT * FROM pb_pokemon WHERE id = ? AND user_id = ?").get(id, req.user.id);
  if (!pokemon) return res.status(404).json({ error: "Not found." });
  if (pokemon.last_fed_at) {
    const secondsSinceFed = db.prepare("SELECT (julianday('now') - julianday(?)) * 86400 AS s").get(pokemon.last_fed_at).s;
    if (secondsSinceFed < FEED_COOLDOWN_SECONDS) return res.status(400).json({ error: "Still full - try again later." });
  }
  const state = db.prepare("SELECT currency FROM pb_state WHERE user_id = ?").get(req.user.id);
  if (state.currency < FEED_COST) return res.status(400).json({ error: "Not enough currency." });
  db.prepare("UPDATE pb_state SET currency = currency - ? WHERE user_id = ?").run(FEED_COST, req.user.id);
  const newHappiness = Math.min(HAPPINESS_MAX, pokemon.happiness + FEED_HAPPINESS_BOOST);
  db.prepare("UPDATE pb_pokemon SET happiness = ?, last_fed_at = datetime('now') WHERE id = ?").run(newHappiness, id);
  res.json(buildStateResponse(req.user.id));
});

pokemonBreederRouter.post("/pokemon/:id/hold-item", (req, res) => {
  runTick(req.user.id);
  const id = Number(req.params.id);
  const item = req.body?.item ?? null;
  if (item !== null && !HELD_ITEMS.includes(item)) return res.status(400).json({ error: "Invalid item." });
  const pokemon = db.prepare("SELECT * FROM pb_pokemon WHERE id = ? AND user_id = ?").get(id, req.user.id);
  if (!pokemon) return res.status(404).json({ error: "Not found." });

  const state = db.prepare("SELECT inventory FROM pb_state WHERE user_id = ?").get(req.user.id);
  const inventory = JSON.parse(state.inventory);
  if (pokemon.held_item) inventory[pokemon.held_item] = (inventory[pokemon.held_item] || 0) + 1;
  if (item) {
    if (!inventory[item] || inventory[item] < 1) {
      return res.status(400).json({ error: "You don't have one of those." });
    }
    inventory[item] -= 1;
  }
  db.prepare("UPDATE pb_state SET inventory = ? WHERE user_id = ?").run(JSON.stringify(inventory), req.user.id);
  db.prepare("UPDATE pb_pokemon SET held_item = ? WHERE id = ?").run(item, id);
  res.json(buildStateResponse(req.user.id));
});

pokemonBreederRouter.post("/pokemon/:id/display", (req, res) => {
  runTick(req.user.id);
  const id = Number(req.params.id);
  const onDisplay = Boolean(req.body?.onDisplay);
  const pokemon = db.prepare("SELECT id FROM pb_pokemon WHERE id = ? AND user_id = ?").get(id, req.user.id);
  if (!pokemon) return res.status(404).json({ error: "Not found." });
  db.prepare("UPDATE pb_pokemon SET on_display = ? WHERE id = ?").run(onDisplay ? 1 : 0, id);
  res.json(buildStateResponse(req.user.id));
});

pokemonBreederRouter.post("/pokemon/:id/sell", (req, res) => {
  runTick(req.user.id);
  const id = Number(req.params.id);
  const pokemon = db.prepare("SELECT * FROM pb_pokemon WHERE id = ? AND user_id = ?").get(id, req.user.id);
  if (!pokemon) return res.status(404).json({ error: "Not found." });
  if (pokemon.on_display) return res.status(400).json({ error: "Take it off display first." });
  if (pokemon.current_pen_id) return res.status(400).json({ error: "Remove it from its pen first." });
  const entry = getEntry(pokemon.species_key);
  const price = priceForPokemon({ ivs: JSON.parse(pokemon.ivs), isShiny: !!pokemon.is_shiny, baseStats: entry.baseStats });
  db.prepare("DELETE FROM pb_pokemon WHERE id = ?").run(id);
  db.prepare("UPDATE pb_state SET currency = currency + ? WHERE user_id = ?").run(price, req.user.id);
  res.json({ ...buildStateResponse(req.user.id), soldFor: price });
});

pokemonBreederRouter.get("/shop", (req, res) => {
  runTick(req.user.id);
  const rows = db.prepare("SELECT * FROM pb_shop ORDER BY id").all();
  res.json({
    listings: rows.map((row) => ({
      id: row.id,
      speciesKey: row.species_key,
      name: dexName(row.species_key),
      sprite: spriteUrl(getEntry(row.species_key), !!row.is_shiny),
      types: getEntry(row.species_key)?.types || [],
      gender: row.gender,
      nature: row.nature,
      ivs: JSON.parse(row.ivs),
      isShiny: !!row.is_shiny,
      price: row.price,
    })),
  });
});

pokemonBreederRouter.post("/shop/:id/buy", (req, res) => {
  runTick(req.user.id);
  const id = Number(req.params.id);
  const listing = db.prepare("SELECT * FROM pb_shop WHERE id = ?").get(id);
  if (!listing) return res.status(404).json({ error: "That listing is gone." });
  const state = db.prepare("SELECT currency FROM pb_state WHERE user_id = ?").get(req.user.id);
  if (state.currency < listing.price) return res.status(400).json({ error: "Not enough currency." });
  db.prepare("UPDATE pb_state SET currency = currency - ? WHERE user_id = ?").run(listing.price, req.user.id);
  insertPokemon(req.user.id, {
    speciesKey: listing.species_key,
    gender: listing.gender,
    nature: listing.nature,
    ivs: JSON.parse(listing.ivs),
    isShiny: !!listing.is_shiny,
    origin: "shop",
    originLocation: null,
  });
  db.prepare("DELETE FROM pb_shop WHERE id = ?").run(id);
  recordDexProgressIfNeeded(req.user.id);
  res.json(buildStateResponse(req.user.id));
});

pokemonBreederRouter.get("/requests", (req, res) => {
  runTick(req.user.id);
  const rows = db.prepare("SELECT * FROM pb_requests WHERE fulfilled_at IS NULL ORDER BY id").all();
  res.json({
    requests: rows.map((row) => ({
      id: row.id,
      speciesKey: row.species_key,
      name: dexName(row.species_key),
      sprite: spriteUrl(getEntry(row.species_key), false),
      criteria: JSON.parse(row.criteria),
      reward: row.reward,
    })),
  });
});

pokemonBreederRouter.post("/requests/:id/fulfill", (req, res) => {
  runTick(req.user.id);
  const id = Number(req.params.id);
  const { pokemonId } = req.body || {};
  const request = db.prepare("SELECT * FROM pb_requests WHERE id = ? AND fulfilled_at IS NULL").get(id);
  if (!request) return res.status(404).json({ error: "That request is no longer available." });
  const pokemon = db.prepare("SELECT * FROM pb_pokemon WHERE id = ? AND user_id = ?").get(pokemonId, req.user.id);
  if (!pokemon) return res.status(404).json({ error: "Pokemon not found." });
  if (pokemon.on_display) return res.status(400).json({ error: "Take it off display first." });
  if (pokemon.species_key !== request.species_key) return res.status(400).json({ error: "Wrong species for this request." });
  if (!pokemonMatchesCriteria(pokemon, JSON.parse(request.criteria))) {
    return res.status(400).json({ error: "This Pokemon doesn't meet the request's criteria." });
  }
  db.prepare("UPDATE pb_requests SET fulfilled_by_user_id = ?, fulfilled_at = datetime('now') WHERE id = ?")
    .run(req.user.id, id);
  db.prepare("DELETE FROM pb_pokemon WHERE id = ?").run(pokemonId);
  db.prepare("UPDATE pb_state SET currency = currency + ? WHERE user_id = ?").run(request.reward, req.user.id);
  res.json({ ...buildStateResponse(req.user.id), reward: request.reward });
});

pokemonBreederRouter.get("/zoos", (req, res) => {
  const rows = db.prepare(`
    SELECT users.username AS username, COUNT(*) AS displayCount
    FROM pb_pokemon
    JOIN users ON users.id = pb_pokemon.user_id
    WHERE pb_pokemon.on_display = 1
    GROUP BY pb_pokemon.user_id
    ORDER BY displayCount DESC
  `).all();
  res.json({ zoos: rows });
});

pokemonBreederRouter.get("/zoos/:username", (req, res) => {
  const user = db.prepare("SELECT id, username FROM users WHERE username = ? COLLATE NOCASE").get(req.params.username);
  if (!user) return res.status(404).json({ error: "User not found." });
  const rows = db.prepare("SELECT * FROM pb_pokemon WHERE user_id = ? AND on_display = 1 ORDER BY id").all(user.id);
  res.json({ username: user.username, pokemon: rows.map(serializePokemon) });
});
