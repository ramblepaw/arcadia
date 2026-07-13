// Bot AI for Monopoly. One pure, stateless function per decision type - each
// reads only public game state (ownership, cash, board data), never anything
// hidden, and returns a decision without mutating anything. main.js is
// responsible for actually calling the corresponding Game mutation method.

import { spaceAt, COLOR_GROUPS, RAILROADS, UTILITIES, JAIL_FINE } from "./board-data.js";
import { ownedSpaceIds, canBuildHouse, canUnmortgage, liquidationSteps, propertyValue } from "./rules.js";

function wouldCompleteGroup(game, botIdx, spaceId) {
  const space = spaceAt(spaceId);
  if (!space.group) return false;
  return COLOR_GROUPS[space.group]
    .filter((id) => id !== spaceId)
    .every((id) => game.properties[id].ownerId === botIdx);
}

/** Whether to buy the property the bot is currently standing on. Values
 *  monopoly-completing properties highly and keeps a cash reserve otherwise. */
export function decideBuyProperty(botIdx, game, spaceId) {
  const space = spaceAt(spaceId);
  const bot = game.players[botIdx];
  if (bot.cash < space.price) return false;

  const completesGroup = wouldCompleteGroup(game, botIdx, spaceId);
  if (completesGroup) return true;

  const reserve = 150 + Math.random() * 150;
  if (bot.cash - space.price < reserve && space.price > bot.cash * 0.35) return false;
  return true;
}

export function decideAuctionBid(botIdx, game, auction) {
  const bot = game.players[botIdx];
  const space = spaceAt(auction.spaceId);
  let value = space.price;

  if (space.type === "property" && wouldCompleteGroup(game, botIdx, auction.spaceId)) {
    value *= 1.6 + Math.random() * 0.4;
  } else if (space.type === "railroad") {
    const owned = RAILROADS.filter((id) => game.properties[id].ownerId === botIdx).length;
    value *= 0.8 + owned * 0.3;
  } else if (space.type === "utility") {
    const owned = UTILITIES.filter((id) => game.properties[id].ownerId === botIdx).length;
    value *= 0.7 + owned * 0.4;
  } else {
    value *= 0.85 + Math.random() * 0.3;
  }

  const nextBid = auction.highBid === 0
    ? Math.max(10, Math.floor(space.price * 0.3))
    : auction.highBid + Math.max(10, Math.floor(space.price * 0.08));

  if (nextBid > value || nextBid > bot.cash) return null;
  if (bot.cash - nextBid < 100 && Math.random() < 0.6) return null;
  return nextBid;
}

export function decideJailAction(botIdx, game) {
  const bot = game.players[botIdx];
  if (bot.jailFreeCards.length > 0) return "useCard";
  const canPay = bot.cash >= JAIL_FINE;
  if (!canPay) return "roll";
  if (bot.jailTurns >= 2) return "pay";
  if (bot.cash > 400 && Math.random() < 0.4) return "pay";
  return "roll";
}

/** One post-roll action per call (build a house, unmortgage, or stop) - the
 *  turn loop applies them one at a time on a timer so a bot's turn is
 *  visually legible instead of an instant wall of changes. */
export function decideNextPostRollAction(botIdx, game) {
  const bot = game.players[botIdx];
  const reserve = 200;

  for (const spaceId of ownedSpaceIds(game, botIdx)) {
    if (canBuildHouse(game, botIdx, spaceId)) {
      const cost = spaceAt(spaceId).houseCost;
      if (bot.cash - cost >= reserve || (bot.cash - cost >= 0 && Math.random() < 0.3)) {
        return { type: "buildHouse", spaceId };
      }
    }
  }

  if (bot.cash > reserve * 3) {
    for (const spaceId of ownedSpaceIds(game, botIdx)) {
      if (canUnmortgage(game, botIdx, spaceId)) {
        return { type: "unmortgage", spaceId };
      }
    }
  }

  return { type: "done" };
}

/** One cash-raising action for a bot in a `mustRaiseCash` crisis: sells a
 *  house or mortgages a property (rules.liquidationSteps already orders
 *  sell-house steps before mortgage steps), or declares bankruptcy if
 *  nothing is left to liquidate. */
export function decideLiquidationAction(botIdx, game) {
  const steps = liquidationSteps(game, botIdx);
  if (steps.length === 0) return { type: "bankrupt" };
  return steps[0];
}

function propertyTradeValue(game, botIdx, spaceId, gaining) {
  const space = spaceAt(spaceId);
  let value = propertyValue(game, spaceId);
  if (space.type === "property") {
    const groupIds = COLOR_GROUPS[space.group];
    const otherOwnedByBot = groupIds.filter((id) => id !== spaceId && game.properties[id].ownerId === botIdx).length;
    if (otherOwnedByBot === groupIds.length - 1) {
      value *= gaining ? 2.2 : 2.5;
    }
  }
  return value;
}

/** Whether to accept a proposed trade (`trade.toIdx` is always this bot -
 *  bots never initiate trades, only respond). Compares rough value on both
 *  sides with a monopoly-completion bonus/penalty and a small tolerance so
 *  bots aren't perfectly rational appraisers. */
export function decideAcceptTrade(botIdx, game, trade) {
  const bot = game.players[botIdx];
  if (trade.requestCash > bot.cash) return false;

  let received = trade.offerCash;
  let given = trade.requestCash;
  for (const id of trade.offerPropertyIds) received += propertyTradeValue(game, botIdx, id, true);
  for (const id of trade.requestPropertyIds) given += propertyTradeValue(game, botIdx, id, false);

  const fairness = received - given;
  const threshold = -(20 + Math.random() * 60);
  return fairness >= threshold;
}
