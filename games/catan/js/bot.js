// Bot AI for Catan. Each function reads game state and returns a decision;
// main.js is responsible for actually calling the corresponding Game
// mutation method, same split as the Monopoly bot.

import { BUILD_COSTS, PIPS } from "./board-data.js";
import { nodeSpotValue, hasResources, totalResourceCount, bestTradeRate } from "./rules.js";

function weightedPick(items, valueFn) {
  let best = null;
  let bestValue = -Infinity;
  for (const item of items) {
    const v = valueFn(item) + Math.random() * 0.75; // small jitter so bots aren't perfectly deterministic
    if (v > bestValue) { bestValue = v; best = item; }
  }
  return best;
}

// ---------- setup phase ----------

export function decideSetupSettlement(botIdx, game) {
  const nodes = game.legalSettlementNodes(botIdx);
  return weightedPick(nodes, (nodeId) => nodeSpotValue(game.board, nodeId));
}

export function decideSetupRoad(botIdx, game) {
  const edges = game.legalRoadEdges(botIdx);
  const settlementNodeId = game.setupState.lastSettlementNodeId;
  return weightedPick(edges, (edgeId) => {
    const edge = game.board.edges[edgeId];
    const otherNode = edge.nodeIds.find((n) => n !== settlementNodeId) ?? edge.nodeIds[0];
    return nodeSpotValue(game.board, otherNode);
  });
}

// ---------- robber ----------

export function decideRobberHex(botIdx, game) {
  const candidates = game.board.hexes.filter((h) => h.id !== game.board.robberHexId);
  return weightedPick(candidates, (hex) => {
    if (hex.resource === "desert") return -5;
    const pips = PIPS[hex.number] || 0;
    let score = 0;
    for (const nodeId of hex.cornerNodeIds) {
      const node = game.board.nodes[nodeId];
      if (!node.building) continue;
      if (node.building.ownerId === botIdx) { score -= pips * 3; continue; }
      const victim = game.players[node.building.ownerId];
      const weight = victim.isHuman ? 1.4 : 1;
      score += pips * (node.building.type === "city" ? 1.6 : 1) * weight;
    }
    return score;
  }).id;
}

export function decideRobberVictim(botIdx, game, victimOptions) {
  return weightedPick(victimOptions, (idx) => {
    const p = game.players[idx];
    const richness = totalResourceCount(p.resources);
    return richness + (p.isHuman ? 1 : 0);
  });
}

export function decideDiscard(botIdx, game, count) {
  const resources = { ...game.players[botIdx].resources };
  const discard = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  let remaining = count;
  const pool = [];
  for (const [res, amt] of Object.entries(resources)) for (let i = 0; i < amt; i++) pool.push(res);
  // shuffle-ish random discard, keeps things simple and unpredictable
  for (let i = pool.length - 1; i > 0 && remaining > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let i = 0; i < remaining; i++) discard[pool[i]]++;
  return discard;
}

// ---------- main turn actions ----------

function affordGap(resources, cost) {
  let gap = 0;
  for (const [res, amt] of Object.entries(cost)) gap += Math.max(0, amt - (resources[res] || 0));
  return gap;
}

function bestSettlementCandidate(game, botIdx) {
  const nodes = game.legalSettlementNodes(botIdx);
  if (nodes.length === 0) return null;
  return weightedPick(nodes, (nodeId) => nodeSpotValue(game.board, nodeId));
}

function bestCityCandidate(game, botIdx) {
  const nodes = game.legalCityNodes(botIdx);
  if (nodes.length === 0) return null;
  return weightedPick(nodes, (nodeId) => nodeSpotValue(game.board, nodeId));
}

function bestRoadCandidate(game, botIdx) {
  const edges = game.legalRoadEdges(botIdx);
  if (edges.length === 0) return null;
  return weightedPick(edges, (edgeId) => {
    const edge = game.board.edges[edgeId];
    const a = nodeSpotValue(game.board, edge.nodeIds[0]);
    const b = nodeSpotValue(game.board, edge.nodeIds[1]);
    return Math.max(a, b);
  });
}

function playableDevCardIndex(game, botIdx, type) {
  const player = game.players[botIdx];
  return player.devCards.findIndex((c) => c.type === type && c.boughtTurn !== game.turnNumber);
}

/** One action per call - main.js runs this on a timer loop until it returns
 *  { type: "done" }, so a bot's turn plays out visibly one step at a time. */
export function decideMainAction(botIdx, game) {
  const player = game.players[botIdx];
  const res = player.resources;

  if (!game.devCardPlayedThisTurn) {
    const knightIdx = playableDevCardIndex(game, botIdx, "knight");
    if (knightIdx >= 0) {
      const robberOnMine = game.board.hexes[game.board.robberHexId].cornerNodeIds
        .some((n) => game.board.nodes[n].building && game.board.nodes[n].building.ownerId === botIdx);
      const oneFromArmy = player.knightsPlayed === 2 && game.largestArmyOwner !== botIdx;
      if (robberOnMine || oneFromArmy || Math.random() < 0.25) {
        return { type: "playDevCard", cardIndex: knightIdx, cardType: "knight" };
      }
    }
  }

  const cityNode = hasResources(res, BUILD_COSTS.city) ? bestCityCandidate(game, botIdx) : null;
  if (cityNode !== null) return { type: "buildCity", nodeId: cityNode };

  const settlementNode = hasResources(res, BUILD_COSTS.settlement) ? bestSettlementCandidate(game, botIdx) : null;
  if (settlementNode !== null) return { type: "buildSettlement", nodeId: settlementNode };

  if (!game.devCardPlayedThisTurn) {
    const roadBuildingIdx = playableDevCardIndex(game, botIdx, "roadBuilding");
    if (roadBuildingIdx >= 0 && game.legalRoadEdges(botIdx).length > 0) {
      const edgeIds = game.legalRoadEdges(botIdx)
        .map((edgeId) => {
          const edge = game.board.edges[edgeId];
          const value = Math.max(nodeSpotValue(game.board, edge.nodeIds[0]), nodeSpotValue(game.board, edge.nodeIds[1]));
          return { edgeId, value };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, 2)
        .map((e) => e.edgeId);
      return { type: "playDevCard", cardIndex: roadBuildingIdx, cardType: "roadBuilding", params: { edgeIds } };
    }
    const yearIdx = playableDevCardIndex(game, botIdx, "yearOfPlenty");
    if (yearIdx >= 0) {
      const need = ["wood", "brick", "sheep", "wheat", "ore"]
        .sort((a, b) => (res[a] || 0) - (res[b] || 0))
        .slice(0, 2);
      return { type: "playDevCard", cardIndex: yearIdx, cardType: "yearOfPlenty", params: { resources: need } };
    }
    const monopolyIdx = playableDevCardIndex(game, botIdx, "monopoly");
    if (monopolyIdx >= 0 && Math.random() < 0.3) {
      const totals = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
      for (const p of game.players) {
        if (p.id === botIdx) continue;
        for (const r of Object.keys(totals)) totals[r] += p.resources[r];
      }
      const resource = Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0];
      if (totals[resource] >= 3) return { type: "playDevCard", cardIndex: monopolyIdx, cardType: "monopoly", params: { resource } };
    }
  }

  if (hasResources(res, BUILD_COSTS.road)) {
    const wantsExpansion = player.piecesLeft.settlement > 0 && game.legalRoadEdges(botIdx).length > 0;
    const chasingLongestRoad = game.longestRoadOwner !== botIdx && game.longestRoadOwner !== null;
    if (wantsExpansion && (Math.random() < 0.6 || chasingLongestRoad)) {
      const roadEdge = bestRoadCandidate(game, botIdx);
      if (roadEdge !== null) return { type: "buildRoad", edgeId: roadEdge };
    }
  }

  if (hasResources(res, BUILD_COSTS.devCard) && game.devCardDeck.length > 0 && Math.random() < 0.55) {
    return { type: "buyDevCard" };
  }

  const surplusTrade = decideSurplusBankTrade(game, botIdx);
  if (surplusTrade) return surplusTrade;

  if (!game.pendingBotTradeOffer) {
    const offer = decideOfferTradeToHuman(game, botIdx);
    if (offer) return offer;
  }

  return { type: "done" };
}

/** If the bot is one resource short of something it could otherwise afford,
 *  and has a clear surplus elsewhere, trade with the bank/port for it. */
function decideSurplusBankTrade(game, botIdx) {
  const res = game.players[botIdx].resources;
  const targets = [BUILD_COSTS.settlement, BUILD_COSTS.city, BUILD_COSTS.road, BUILD_COSTS.devCard];
  for (const cost of targets) {
    if (affordGap(res, cost) !== 1) continue;
    const missing = Object.keys(cost).find((r) => (res[r] || 0) < cost[r]);
    for (const give of ["wood", "brick", "sheep", "wheat", "ore"]) {
      if (give === missing) continue;
      const rate = bestTradeRate(game.board, botIdx, give);
      if ((res[give] || 0) >= rate + 2) return { type: "bankTrade", give, want: missing };
    }
  }
  return null;
}

/** Offers the human a 1-for-1 (or 2-for-1 if desperate) trade when the bot
 *  is missing exactly one resource type for its next build. Bots never
 *  initiate trades with each other - keeps the scope to one active offer. */
function decideOfferTradeToHuman(game, botIdx) {
  const res = game.players[botIdx].resources;
  const targets = [BUILD_COSTS.settlement, BUILD_COSTS.city, BUILD_COSTS.road];
  for (const cost of targets) {
    if (affordGap(res, cost) !== 1) continue;
    const missing = Object.keys(cost).find((r) => (res[r] || 0) < cost[r]);
    const surplus = ["wood", "brick", "sheep", "wheat", "ore"]
      .filter((r) => r !== missing && (res[r] || 0) >= 3)
      .sort((a, b) => (res[b] || 0) - (res[a] || 0))[0];
    if (surplus && Math.random() < 0.5) {
      return { type: "offerTrade", give: { [surplus]: 1 }, want: { [missing]: 1 } };
    }
  }
  return null;
}

/** Whether to accept a player-proposed trade (`offer.give`/`offer.want` are
 *  from the proposer's point of view - this bot would receive `give` and
 *  hand over `want`). Compares raw resource-for-resource value with a small
 *  tolerance so bots don't accept lopsided deals just because they can. */
export function decideAcceptTrade(botIdx, game, offer) {
  const player = game.players[botIdx];
  if (!hasResources(player.resources, offer.want)) return false;

  const giveCount = Object.values(offer.give).reduce((a, b) => a + b, 0);
  const wantCount = Object.values(offer.want).reduce((a, b) => a + b, 0);
  const spareOfWanted = Object.entries(offer.want).every(([res, amt]) => (player.resources[res] || 0) - amt >= 2);

  if (wantCount > giveCount + 1) return false;
  if (wantCount >= giveCount && !spareOfWanted) return false;
  return Math.random() < (giveCount >= wantCount ? 0.85 : 0.4);
}
