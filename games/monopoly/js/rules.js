// Pure calculation/validation helpers - no state mutation, no side effects.
// Everything here reads from a Game instance but never changes it, keeping
// game.js focused on orchestration rather than arithmetic.

import { SPACES, COLOR_GROUPS, RAILROADS, UTILITIES, MORTGAGE_INTEREST, spaceAt } from "./board-data.js";

export function ownedSpaceIds(game, playerIdx) {
  return Object.keys(game.properties)
    .map(Number)
    .filter((id) => game.properties[id].ownerId === playerIdx);
}

export function ownsFullGroup(game, playerIdx, group) {
  const ids = COLOR_GROUPS[group];
  if (!ids) return false;
  return ids.every((id) => game.properties[id].ownerId === playerIdx);
}

function railroadsOwnedBy(game, ownerId) {
  return RAILROADS.filter((id) => game.properties[id].ownerId === ownerId).length;
}

function utilitiesOwnedBy(game, ownerId) {
  return UTILITIES.filter((id) => game.properties[id].ownerId === ownerId).length;
}

/** Rent owed for landing on `spaceId`, given its current owner/houses/mortgage
 *  state. `opts.diceTotal` is required for utilities. `opts.rentMultiplier`
 *  overrides the normal multiplier (used by the "advance to nearest
 *  railroad/utility" Chance cards). Returns 0 for unowned or mortgaged spaces. */
export function computeRent(game, spaceId, opts = {}) {
  const space = spaceAt(spaceId);
  const prop = game.properties[spaceId];
  if (!prop || prop.ownerId === null || prop.mortgaged) return 0;

  if (space.type === "property") {
    const idx = prop.hotel ? 5 : prop.houses;
    if (idx === 0 && ownsFullGroup(game, prop.ownerId, space.group)) {
      return space.rent[0] * 2;
    }
    return space.rent[idx];
  }

  if (space.type === "railroad") {
    const count = railroadsOwnedBy(game, prop.ownerId);
    const base = 25 * Math.pow(2, count - 1);
    return base * (opts.rentMultiplier || 1);
  }

  if (space.type === "utility") {
    const count = utilitiesOwnedBy(game, prop.ownerId);
    const multiplier = opts.rentMultiplier || (count === 2 ? 10 : 4);
    return (opts.diceTotal || 0) * multiplier;
  }

  return 0;
}

function groupHouseTotal(game, group) {
  return COLOR_GROUPS[group].reduce((sum, id) => {
    const p = game.properties[id];
    return sum + (p.hotel ? 5 : p.houses);
  }, 0);
}

function groupMinHouses(game, group) {
  return Math.min(...COLOR_GROUPS[group].map((id) => (game.properties[id].hotel ? 5 : game.properties[id].houses)));
}

function groupMaxHouses(game, group) {
  return Math.max(...COLOR_GROUPS[group].map((id) => (game.properties[id].hotel ? 5 : game.properties[id].houses)));
}

function groupHasMortgaged(game, group) {
  return COLOR_GROUPS[group].some((id) => game.properties[id].mortgaged);
}

/** Even-build rule: you may only add a house to the property(ies) currently
 *  at the group's minimum house count. */
export function canBuildHouse(game, playerIdx, spaceId) {
  const space = spaceAt(spaceId);
  if (space.type !== "property") return false;
  const prop = game.properties[spaceId];
  if (prop.ownerId !== playerIdx || prop.hotel || prop.mortgaged) return false;
  if (!ownsFullGroup(game, playerIdx, space.group)) return false;
  if (groupHasMortgaged(game, space.group)) return false;
  if (prop.houses !== groupMinHouses(game, space.group)) return false;
  if (game.players[playerIdx].cash < space.houseCost) return false;
  if (prop.houses === 4) return game.bank.hotelsLeft > 0;
  return game.bank.housesLeft > 0;
}

/** Even-teardown rule: you may only sell from the property(ies) currently at
 *  the group's maximum house count. */
export function canSellHouse(game, playerIdx, spaceId) {
  const space = spaceAt(spaceId);
  if (space.type !== "property") return false;
  const prop = game.properties[spaceId];
  if (prop.ownerId !== playerIdx) return false;
  if (prop.houses === 0 && !prop.hotel) return false;
  const level = prop.hotel ? 5 : prop.houses;
  if (level !== groupMaxHouses(game, space.group)) return false;
  if (prop.hotel && game.bank.housesLeft < 4) return false; // can't downgrade without houses to give back
  return true;
}

export function canMortgage(game, playerIdx, spaceId) {
  const space = spaceAt(spaceId);
  const prop = game.properties[spaceId];
  if (!prop || prop.ownerId !== playerIdx || prop.mortgaged) return false;
  if (space.type === "property" && groupHouseTotal(game, space.group) > 0) return false;
  return true;
}

export function canUnmortgage(game, playerIdx, spaceId) {
  const prop = game.properties[spaceId];
  if (!prop || prop.ownerId !== playerIdx || !prop.mortgaged) return false;
  return game.players[playerIdx].cash >= unmortgageCostOf(spaceId);
}

export function mortgageValueOf(spaceId) {
  return spaceAt(spaceId).mortgage;
}

export function unmortgageCostOf(spaceId) {
  return Math.ceil(spaceAt(spaceId).mortgage * (1 + MORTGAGE_INTEREST));
}

/** Rough value of a property for trade/net-worth purposes: purchase price
 *  plus money invested in buildings, minus outstanding mortgage debt. */
export function propertyValue(game, spaceId) {
  const space = spaceAt(spaceId);
  const prop = game.properties[spaceId];
  let value = space.price;
  if (space.type === "property") {
    value += prop.houses * space.houseCost;
    if (prop.hotel) value += 5 * space.houseCost;
  }
  if (prop.mortgaged) value -= space.mortgage;
  return value;
}

export function netWorth(game, playerIdx) {
  let total = game.players[playerIdx].cash;
  for (const spaceId of ownedSpaceIds(game, playerIdx)) total += propertyValue(game, spaceId);
  return total;
}

/** All currently-legal single cash-raising actions for a player, sell-house
 *  actions first (cheaper loss than mortgaging) then mortgage actions. Used
 *  both by bot auto-liquidation and by the human's forced Raise Cash modal. */
export function liquidationSteps(game, playerIdx) {
  const steps = [];
  for (const spaceId of ownedSpaceIds(game, playerIdx)) {
    if (canSellHouse(game, playerIdx, spaceId)) {
      const space = spaceAt(spaceId);
      steps.push({ type: "sellHouse", spaceId, amount: Math.floor(space.houseCost / 2) });
    }
  }
  for (const spaceId of ownedSpaceIds(game, playerIdx)) {
    if (canMortgage(game, playerIdx, spaceId)) {
      steps.push({ type: "mortgage", spaceId, amount: mortgageValueOf(spaceId) });
    }
  }
  return steps;
}

export function maxRaisableCash(game, playerIdx) {
  return liquidationSteps(game, playerIdx).reduce((sum, s) => sum + s.amount, 0);
}

/** Validates a proposed trade: both sides must actually own what they're
 *  offering, neither side can trade a property with buildings on it (must
 *  sell houses first, matching the mortgage restriction), and cash offered
 *  must not exceed cash on hand. */
export function validateTrade(game, trade) {
  const { fromIdx, toIdx, offerCash, offerPropertyIds, requestCash, requestPropertyIds } = trade;
  const from = game.players[fromIdx];
  const to = game.players[toIdx];
  if (!from || !to || fromIdx === toIdx) return { valid: false, reason: "Invalid players." };

  for (const id of offerPropertyIds) {
    const p = game.properties[id];
    if (!p || p.ownerId !== fromIdx) return { valid: false, reason: "You don't own one of the offered properties." };
    if (p.houses > 0 || p.hotel) return { valid: false, reason: "Sell houses before trading that property." };
  }
  for (const id of requestPropertyIds) {
    const p = game.properties[id];
    if (!p || p.ownerId !== toIdx) return { valid: false, reason: "They don't own one of the requested properties." };
    if (p.houses > 0 || p.hotel) return { valid: false, reason: "That property has houses on it." };
  }
  if (offerCash < 0 || requestCash < 0) return { valid: false, reason: "Cash amounts can't be negative." };
  if (offerCash > from.cash) return { valid: false, reason: "You don't have that much cash." };
  if (requestCash > to.cash) return { valid: false, reason: "They don't have that much cash." };
  if (offerPropertyIds.length === 0 && requestPropertyIds.length === 0 && offerCash === 0 && requestCash === 0) {
    return { valid: false, reason: "That trade offers nothing." };
  }
  return { valid: true };
}
