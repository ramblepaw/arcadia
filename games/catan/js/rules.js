// Pure rule helpers - everything here reads game state and returns an
// answer without mutating anything. game.js owns all mutation.

import { BUILD_COSTS, PIPS } from "./board-data.js";

export function hasResources(resources, cost) {
  return Object.entries(cost).every(([res, amt]) => (resources[res] || 0) >= amt);
}

export function payResources(resources, cost) {
  for (const [res, amt] of Object.entries(cost)) resources[res] -= amt;
}

export function totalResourceCount(resources) {
  return Object.values(resources).reduce((a, b) => a + b, 0);
}

/** A settlement may go on any empty node whose every neighboring node is
 *  also empty (the "distance rule"). During normal play it must additionally
 *  touch one of the player's own roads. */
export function canPlaceSettlement(board, playerIdx, nodeId, { isSetup = false } = {}) {
  const node = board.nodes[nodeId];
  if (node.building) return false;
  if (node.neighborIds.some((nid) => board.nodes[nid].building)) return false;
  if (isSetup) return true;
  return node.edgeIds.some((eid) => board.edges[eid].road === playerIdx);
}

export function canPlaceCity(board, playerIdx, nodeId) {
  const node = board.nodes[nodeId];
  return !!node.building && node.building.ownerId === playerIdx && node.building.type === "settlement";
}

/** A road must connect to one of the player's own buildings or existing
 *  roads. During setup it must attach to the settlement just placed. */
export function canPlaceRoad(board, playerIdx, edgeId, { isSetup = false, mustTouchNodeId = null } = {}) {
  const edge = board.edges[edgeId];
  if (edge.road !== null) return false;
  if (isSetup) return edge.nodeIds.includes(mustTouchNodeId);
  return edge.nodeIds.some((nid) => {
    const node = board.nodes[nid];
    if (node.building && node.building.ownerId === playerIdx) return true;
    return node.edgeIds.some((eid) => eid !== edgeId && board.edges[eid].road === playerIdx);
  });
}

export function anyLegalRoadSpot(board, playerIdx) {
  return board.edges.some((e) => canPlaceRoad(board, playerIdx, e.id));
}

export function anyLegalSettlementSpot(board, playerIdx) {
  return board.nodes.some((n) => canPlaceSettlement(board, playerIdx, n.id));
}

/** Best bank/port trade rate a player can get for giving up `resource`. */
export function bestTradeRate(board, playerIdx, resource) {
  let best = 4;
  for (const node of board.nodes) {
    if (!node.building || node.building.ownerId !== playerIdx || !node.port) continue;
    if (node.port === "3:1") best = Math.min(best, 3);
    else if (node.port === resource) best = Math.min(best, 2);
  }
  return best;
}

/** Resource yield for every player when `diceRoll` is produced, keyed by
 *  playerIdx -> { resource: amount }. The 7-hex (robber) never produces. */
export function productionForRoll(board, diceRoll) {
  const gains = {};
  for (const hex of board.hexes) {
    if (hex.number !== diceRoll || hex.id === board.robberHexId || hex.resource === "desert") continue;
    for (const nodeId of hex.cornerNodeIds) {
      const node = board.nodes[nodeId];
      if (!node.building) continue;
      const amount = node.building.type === "city" ? 2 : 1;
      gains[node.building.ownerId] = gains[node.building.ownerId] || {};
      gains[node.building.ownerId][hex.resource] = (gains[node.building.ownerId][hex.resource] || 0) + amount;
    }
  }
  return gains;
}

/** Longest simple path (in edges) through a player's own road network. An
 *  opponent's building on an intermediate node breaks the chain there - the
 *  edge into that node still counts, but the path can't continue past it. */
export function longestRoadLength(board, playerIdx) {
  const ownedEdgeIds = board.edges.filter((e) => e.road === playerIdx).map((e) => e.id);
  if (ownedEdgeIds.length === 0) return 0;

  const touchedNodeIds = new Set();
  ownedEdgeIds.forEach((eid) => board.edges[eid].nodeIds.forEach((n) => touchedNodeIds.add(n)));

  function dfs(nodeId, visitedEdges) {
    let best = visitedEdges.size;
    for (const edgeId of board.nodes[nodeId].edgeIds) {
      if (visitedEdges.has(edgeId)) continue;
      const edge = board.edges[edgeId];
      if (edge.road !== playerIdx) continue;
      const other = edge.nodeIds[0] === nodeId ? edge.nodeIds[1] : edge.nodeIds[0];
      const otherNode = board.nodes[other];
      if (otherNode.building && otherNode.building.ownerId !== playerIdx) {
        best = Math.max(best, visitedEdges.size + 1);
        continue;
      }
      visitedEdges.add(edgeId);
      best = Math.max(best, dfs(other, visitedEdges));
      visitedEdges.delete(edgeId);
    }
    return best;
  }

  let maxLen = 0;
  for (const nodeId of touchedNodeIds) maxLen = Math.max(maxLen, dfs(nodeId, new Set()));
  return maxLen;
}

/** Public (visible-to-everyone) victory points: settlements, cities, and the
 *  longest-road/largest-army bonuses. Excludes hidden victory-point dev
 *  cards, which only the owner (and the win check) can see. */
export function publicVictoryPoints(game, playerIdx) {
  let vp = 0;
  for (const node of game.board.nodes) {
    if (node.building && node.building.ownerId === playerIdx) {
      vp += node.building.type === "city" ? 2 : 1;
    }
  }
  if (game.longestRoadOwner === playerIdx) vp += 2;
  if (game.largestArmyOwner === playerIdx) vp += 2;
  return vp;
}

export function hiddenVictoryPoints(player) {
  return player.devCards.filter((c) => c.type === "victoryPoint").length;
}

export function totalVictoryPoints(game, playerIdx) {
  return publicVictoryPoints(game, playerIdx) + hiddenVictoryPoints(game.players[playerIdx]);
}

/** Heuristic value of a node as a settlement spot: sum of adjacent hexes'
 *  pip counts (probability weight), with a bonus for resource-type variety
 *  and for sitting on a port. Used by setup auto-placement and the bot. */
export function nodeSpotValue(board, nodeId) {
  const node = board.nodes[nodeId];
  let value = 0;
  const resourceTypes = new Set();
  for (const hexId of node.hexIds) {
    const hex = board.hexes[hexId];
    if (hex.resource === "desert") continue;
    value += PIPS[hex.number] || 0;
    resourceTypes.add(hex.resource);
  }
  value += resourceTypes.size * 1.5;
  if (node.port) value += node.port === "3:1" ? 1 : 2;
  return value;
}

export { BUILD_COSTS };
