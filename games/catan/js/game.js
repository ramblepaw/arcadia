import { generateBoard, BUILD_COSTS, PIECE_SUPPLY } from "./board-data.js";
import { newDevCardDeck } from "./cards.js";
import {
  canPlaceSettlement, canPlaceCity, canPlaceRoad,
  bestTradeRate, productionForRoll, longestRoadLength, publicVictoryPoints, totalVictoryPoints,
  hasResources, payResources, totalResourceCount,
} from "./rules.js";

const BOT_NAMES = ["Ada", "Beau", "Casey", "Dana", "Ezra", "Finch", "Gwen", "Huxley"];
const PLAYER_COLORS = ["#c0392b", "#3b6ea5", "#d98a34", "#e8e2d0"];
const EMPTY_RESOURCES = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

function pickBotNames(count) {
  const pool = [...BOT_NAMES];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function makePlayer(id, name, isHuman) {
  return {
    id, name, isHuman, color: PLAYER_COLORS[id],
    resources: EMPTY_RESOURCES(),
    devCards: [], // { type, boughtTurn }
    knightsPlayed: 0,
    piecesLeft: { road: PIECE_SUPPLY.road, settlement: PIECE_SUPPLY.settlement, city: PIECE_SUPPLY.city },
  };
}

function snakeOrder(numPlayers) {
  const order = [];
  for (let i = 0; i < numPlayers; i++) order.push(i);
  for (let i = numPlayers - 1; i >= 0; i--) order.push(i);
  return order;
}

export class Game {
  constructor(numBots) {
    this.numPlayers = numBots + 1;
    this.players = [makePlayer(0, "You", true)];
    const botNames = pickBotNames(numBots);
    for (let i = 1; i <= numBots; i++) this.players.push(makePlayer(i, botNames[i - 1], false));

    this.board = generateBoard();
    this.devCardDeck = newDevCardDeck();

    this.phase = "setup"; // setup | playing | gameOver
    this.setupState = { queue: snakeOrder(this.numPlayers), stepIndex: 0, subPhase: "settlement", lastSettlementNodeId: null };

    this.currentPlayerIndex = this.setupState.queue[0];
    this.turnNumber = 1;
    this.turnPhase = "setup"; // setup | preRoll | discard | robberMove | robberSteal | actions | gameOver
    this.dice = [0, 0];
    this.devCardPlayedThisTurn = false;

    this.pendingDiscards = []; // [{ playerIdx, count }]
    this.pendingRobber = null; // { reason: 'sevenRoll' | 'knight' }
    this.pendingSteal = null; // { hexId, victimOptions: [playerIdx] }
    this.pendingTradeOffer = null; // { fromIdx, give, want, respondedBots: [] }
    this.pendingBotTradeOffer = null; // { fromIdx, give, want }

    this.longestRoadOwner = null;
    this.largestArmyOwner = null;
    this.winner = null;

    this.log = [];
    this.listeners = [];
    this.pushLog(`${this.nameFor(this.currentPlayerIndex)} places the first settlement.`);
  }

  subscribe(fn) { this.listeners.push(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }
  pushLog(text) { this.log.push(text); if (this.log.length > 80) this.log.shift(); }
  nameFor(idx) { return this.players[idx].name; }
  get currentPlayer() { return this.players[this.currentPlayerIndex]; }
  get isGameOver() { return this.phase === "gameOver"; }

  // ---------- derived / query helpers ----------

  currentSetupPlayerIdx() {
    return this.setupState.queue[this.setupState.stepIndex];
  }

  legalSettlementNodes(playerIdx) {
    const isSetup = this.phase === "setup";
    return this.board.nodes.filter((n) => canPlaceSettlement(this.board, playerIdx, n.id, { isSetup })).map((n) => n.id);
  }

  legalCityNodes(playerIdx) {
    return this.board.nodes.filter((n) => canPlaceCity(this.board, playerIdx, n.id)).map((n) => n.id);
  }

  legalRoadEdges(playerIdx) {
    if (this.phase === "setup") {
      return this.board.edges
        .filter((e) => canPlaceRoad(this.board, playerIdx, e.id, { isSetup: true, mustTouchNodeId: this.setupState.lastSettlementNodeId }))
        .map((e) => e.id);
    }
    return this.board.edges.filter((e) => canPlaceRoad(this.board, playerIdx, e.id)).map((e) => e.id);
  }

  roadLengthFor(playerIdx) {
    return longestRoadLength(this.board, playerIdx);
  }

  vpFor(playerIdx) {
    return publicVictoryPoints(this, playerIdx);
  }

  standings() {
    return this.players.slice().sort((a, b) => totalVictoryPoints(this, b.id) - totalVictoryPoints(this, a.id));
  }

  // ---------- setup phase ----------

  placeSetupSettlement(playerIdx, nodeId) {
    if (this.phase !== "setup" || this.setupState.subPhase !== "settlement") return { valid: false, reason: "Not settlement placement time." };
    if (playerIdx !== this.currentSetupPlayerIdx()) return { valid: false, reason: "Not your turn." };
    if (!canPlaceSettlement(this.board, playerIdx, nodeId, { isSetup: true })) return { valid: false, reason: "Illegal spot." };

    const node = this.board.nodes[nodeId];
    node.building = { ownerId: playerIdx, type: "settlement" };
    this.players[playerIdx].piecesLeft.settlement--;

    if (this.setupState.stepIndex >= this.numPlayers) {
      for (const hexId of node.hexIds) {
        const hex = this.board.hexes[hexId];
        if (hex.resource !== "desert") this.players[playerIdx].resources[hex.resource]++;
      }
    }

    this.setupState.lastSettlementNodeId = nodeId;
    this.setupState.subPhase = "road";
    this.pushLog(`${this.nameFor(playerIdx)} placed a settlement.`);
    this.emit();
    return { valid: true };
  }

  placeSetupRoad(playerIdx, edgeId) {
    if (this.phase !== "setup" || this.setupState.subPhase !== "road") return { valid: false, reason: "Not road placement time." };
    if (playerIdx !== this.currentSetupPlayerIdx()) return { valid: false, reason: "Not your turn." };
    if (!canPlaceRoad(this.board, playerIdx, edgeId, { isSetup: true, mustTouchNodeId: this.setupState.lastSettlementNodeId })) {
      return { valid: false, reason: "Illegal spot." };
    }

    this.board.edges[edgeId].road = playerIdx;
    this.players[playerIdx].piecesLeft.road--;
    this.pushLog(`${this.nameFor(playerIdx)} placed a road.`);

    this.setupState.stepIndex++;
    this.setupState.subPhase = "settlement";
    this.setupState.lastSettlementNodeId = null;

    if (this.setupState.stepIndex >= this.setupState.queue.length) {
      this.phase = "playing";
      this.currentPlayerIndex = this.setupState.queue[0];
      this.turnPhase = "preRoll";
      this.recomputeLongestRoad();
      this.pushLog(`Setup complete. ${this.nameFor(this.currentPlayerIndex)} goes first.`);
    } else {
      this.pushLog(`${this.nameFor(this.currentSetupPlayerIdx())} places a settlement.`);
    }
    this.emit();
    return { valid: true };
  }

  // ---------- main turn: rolling & robber ----------

  rollDice(playerIdx) {
    if (this.turnPhase !== "preRoll" || playerIdx !== this.currentPlayerIndex) return { valid: false };
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    this.dice = [d1, d2];
    const total = d1 + d2;
    this.pushLog(`${this.nameFor(playerIdx)} rolled ${total} (${d1}+${d2}).`);

    if (total === 7) {
      this.pendingDiscards = [];
      for (const p of this.players) {
        const count = totalResourceCount(p.resources);
        if (count > 7) this.pendingDiscards.push({ playerIdx: p.id, count: Math.floor(count / 2) });
      }
      this.pendingRobber = { reason: "sevenRoll" };
      this.turnPhase = this.pendingDiscards.length > 0 ? "discard" : "robberMove";
      if (this.pendingDiscards.length > 0) this.pushLog("Rolled a 7 - players with 8+ cards must discard half.");
    } else {
      const gains = productionForRoll(this.board, total);
      for (const [idxStr, resGains] of Object.entries(gains)) {
        const p = this.players[idxStr];
        let parts = [];
        for (const [res, amt] of Object.entries(resGains)) {
          p.resources[res] += amt;
          parts.push(`${amt} ${res}`);
        }
        this.pushLog(`${p.name} collected ${parts.join(", ")}.`);
      }
      this.turnPhase = "actions";
    }
    this.emit();
    return { valid: true };
  }

  discardResources(playerIdx, discardCounts) {
    const entry = this.pendingDiscards.find((d) => d.playerIdx === playerIdx);
    if (this.turnPhase !== "discard" || !entry) return { valid: false, reason: "No discard pending." };
    const sum = Object.values(discardCounts).reduce((a, b) => a + b, 0);
    if (sum !== entry.count) return { valid: false, reason: `Must discard exactly ${entry.count}.` };
    if (!hasResources(this.players[playerIdx].resources, discardCounts)) return { valid: false, reason: "Not enough cards." };

    payResources(this.players[playerIdx].resources, discardCounts);
    this.pendingDiscards = this.pendingDiscards.filter((d) => d.playerIdx !== playerIdx);
    this.pushLog(`${this.nameFor(playerIdx)} discarded ${entry.count} cards.`);

    if (this.pendingDiscards.length === 0) this.turnPhase = "robberMove";
    this.emit();
    return { valid: true };
  }

  moveRobber(playerIdx, hexId) {
    if (this.turnPhase !== "robberMove" || playerIdx !== this.currentPlayerIndex) return { valid: false };
    if (hexId === this.board.robberHexId) return { valid: false, reason: "Robber must move to a new hex." };

    this.board.robberHexId = hexId;
    const hex = this.board.hexes[hexId];
    const victims = new Set();
    for (const nodeId of hex.cornerNodeIds) {
      const node = this.board.nodes[nodeId];
      if (node.building && node.building.ownerId !== playerIdx && totalResourceCount(this.players[node.building.ownerId].resources) > 0) {
        victims.add(node.building.ownerId);
      }
    }
    this.pushLog(`${this.nameFor(playerIdx)} moved the robber.`);

    if (victims.size === 0) {
      this.turnPhase = "actions";
      this.pendingRobber = null;
    } else if (victims.size === 1) {
      this._stealFrom(playerIdx, [...victims][0]);
      this.turnPhase = "actions";
      this.pendingRobber = null;
    } else {
      this.pendingSteal = { hexId, victimOptions: [...victims] };
      this.turnPhase = "robberSteal";
    }
    this.emit();
    return { valid: true };
  }

  stealResource(playerIdx, victimIdx) {
    if (this.turnPhase !== "robberSteal" || !this.pendingSteal || !this.pendingSteal.victimOptions.includes(victimIdx)) {
      return { valid: false };
    }
    this._stealFrom(playerIdx, victimIdx);
    this.pendingSteal = null;
    this.pendingRobber = null;
    this.turnPhase = "actions";
    this.emit();
    return { valid: true };
  }

  _stealFrom(playerIdx, victimIdx) {
    const victim = this.players[victimIdx];
    const pool = [];
    for (const [res, amt] of Object.entries(victim.resources)) for (let i = 0; i < amt; i++) pool.push(res);
    if (pool.length === 0) return;
    const res = pool[Math.floor(Math.random() * pool.length)];
    victim.resources[res]--;
    this.players[playerIdx].resources[res]++;
    this.pushLog(`${this.nameFor(playerIdx)} stole a card from ${victim.name}.`);
  }

  // ---------- building ----------

  buildRoad(playerIdx, edgeId) {
    if (this.turnPhase !== "actions" || playerIdx !== this.currentPlayerIndex) return { valid: false };
    if (this.players[playerIdx].piecesLeft.road <= 0) return { valid: false, reason: "No roads left." };
    if (!canPlaceRoad(this.board, playerIdx, edgeId)) return { valid: false, reason: "Illegal spot." };
    if (!hasResources(this.players[playerIdx].resources, BUILD_COSTS.road)) return { valid: false, reason: "Not enough resources." };

    payResources(this.players[playerIdx].resources, BUILD_COSTS.road);
    this.board.edges[edgeId].road = playerIdx;
    this.players[playerIdx].piecesLeft.road--;
    this.pushLog(`${this.nameFor(playerIdx)} built a road.`);
    this.recomputeLongestRoad();
    this.checkWin(playerIdx);
    this.emit();
    return { valid: true };
  }

  buildSettlement(playerIdx, nodeId) {
    if (this.turnPhase !== "actions" || playerIdx !== this.currentPlayerIndex) return { valid: false };
    if (this.players[playerIdx].piecesLeft.settlement <= 0) return { valid: false, reason: "No settlements left." };
    if (!canPlaceSettlement(this.board, playerIdx, nodeId)) return { valid: false, reason: "Illegal spot." };
    if (!hasResources(this.players[playerIdx].resources, BUILD_COSTS.settlement)) return { valid: false, reason: "Not enough resources." };

    payResources(this.players[playerIdx].resources, BUILD_COSTS.settlement);
    this.board.nodes[nodeId].building = { ownerId: playerIdx, type: "settlement" };
    this.players[playerIdx].piecesLeft.settlement--;
    this.pushLog(`${this.nameFor(playerIdx)} built a settlement.`);
    this.recomputeLongestRoad();
    this.checkWin(playerIdx);
    this.emit();
    return { valid: true };
  }

  buildCity(playerIdx, nodeId) {
    if (this.turnPhase !== "actions" || playerIdx !== this.currentPlayerIndex) return { valid: false };
    if (this.players[playerIdx].piecesLeft.city <= 0) return { valid: false, reason: "No cities left." };
    if (!canPlaceCity(this.board, playerIdx, nodeId)) return { valid: false, reason: "Illegal spot." };
    if (!hasResources(this.players[playerIdx].resources, BUILD_COSTS.city)) return { valid: false, reason: "Not enough resources." };

    payResources(this.players[playerIdx].resources, BUILD_COSTS.city);
    this.board.nodes[nodeId].building.type = "city";
    this.players[playerIdx].piecesLeft.city--;
    this.players[playerIdx].piecesLeft.settlement++;
    this.pushLog(`${this.nameFor(playerIdx)} built a city.`);
    this.checkWin(playerIdx);
    this.emit();
    return { valid: true };
  }

  buyDevCard(playerIdx) {
    if (this.turnPhase !== "actions" || playerIdx !== this.currentPlayerIndex) return { valid: false };
    if (this.devCardDeck.length === 0) return { valid: false, reason: "Deck is empty." };
    if (!hasResources(this.players[playerIdx].resources, BUILD_COSTS.devCard)) return { valid: false, reason: "Not enough resources." };

    payResources(this.players[playerIdx].resources, BUILD_COSTS.devCard);
    const type = this.devCardDeck.pop();
    this.players[playerIdx].devCards.push({ type, boughtTurn: this.turnNumber });
    this.pushLog(`${this.nameFor(playerIdx)} bought a development card.`);
    if (type === "victoryPoint") this.checkWin(playerIdx);
    this.emit();
    return { valid: true, type };
  }

  // ---------- development cards ----------

  playDevCard(playerIdx, cardIndex, params = {}) {
    if (this.turnPhase !== "actions" || playerIdx !== this.currentPlayerIndex) return { valid: false };
    if (this.devCardPlayedThisTurn) return { valid: false, reason: "Already played a card this turn." };
    const player = this.players[playerIdx];
    const card = player.devCards[cardIndex];
    if (!card) return { valid: false, reason: "No such card." };
    if (card.type === "victoryPoint") return { valid: false, reason: "Victory point cards aren't played." };
    if (card.boughtTurn === this.turnNumber) return { valid: false, reason: "Can't play a card bought this turn." };

    if (card.type === "knight") {
      player.devCards.splice(cardIndex, 1);
      this.devCardPlayedThisTurn = true;
      player.knightsPlayed++;
      this.recomputeLargestArmy();
      this.pendingRobber = { reason: "knight" };
      this.turnPhase = "robberMove";
      this.pushLog(`${this.nameFor(playerIdx)} played a Knight.`);
    } else if (card.type === "roadBuilding") {
      const edgeIds = params.edgeIds || [];
      player.devCards.splice(cardIndex, 1);
      this.devCardPlayedThisTurn = true;
      let built = 0;
      for (const edgeId of edgeIds) {
        if (built >= 2 || player.piecesLeft.road <= 0) break;
        if (canPlaceRoad(this.board, playerIdx, edgeId)) {
          this.board.edges[edgeId].road = playerIdx;
          player.piecesLeft.road--;
          built++;
        }
      }
      this.pushLog(`${this.nameFor(playerIdx)} played Road Building (${built} free road${built === 1 ? "" : "s"}).`);
      this.recomputeLongestRoad();
    } else if (card.type === "yearOfPlenty") {
      const picks = params.resources || [];
      player.devCards.splice(cardIndex, 1);
      this.devCardPlayedThisTurn = true;
      for (const res of picks.slice(0, 2)) player.resources[res]++;
      this.pushLog(`${this.nameFor(playerIdx)} played Year of Plenty.`);
    } else if (card.type === "monopoly") {
      const resource = params.resource;
      player.devCards.splice(cardIndex, 1);
      this.devCardPlayedThisTurn = true;
      let total = 0;
      for (const p of this.players) {
        if (p.id === playerIdx) continue;
        total += p.resources[resource];
        p.resources[resource] = 0;
      }
      player.resources[resource] += total;
      this.pushLog(`${this.nameFor(playerIdx)} played Monopoly on ${resource} (took ${total}).`);
    } else {
      return { valid: false };
    }

    this.checkWin(playerIdx);
    this.emit();
    return { valid: true };
  }

  // ---------- trading ----------

  bankTrade(playerIdx, giveResource, wantResource) {
    if (this.turnPhase !== "actions" || playerIdx !== this.currentPlayerIndex) return { valid: false };
    const rate = bestTradeRate(this.board, playerIdx, giveResource);
    const player = this.players[playerIdx];
    if (player.resources[giveResource] < rate) return { valid: false, reason: "Not enough resources." };

    player.resources[giveResource] -= rate;
    player.resources[wantResource] += 1;
    this.pushLog(`${this.nameFor(playerIdx)} traded ${rate} ${giveResource} for 1 ${wantResource}.`);
    this.emit();
    return { valid: true };
  }

  proposePlayerTrade(fromIdx, give, want) {
    if (this.turnPhase !== "actions" || fromIdx !== this.currentPlayerIndex) return { valid: false };
    if (!hasResources(this.players[fromIdx].resources, give)) return { valid: false, reason: "Not enough resources." };
    this.pendingTradeOffer = { fromIdx, give, want, respondedBots: [] };
    this.pushLog(`${this.nameFor(fromIdx)} proposed a trade.`);
    this.emit();
    return { valid: true };
  }

  respondToPlayerTrade(playerIdx, accept) {
    const offer = this.pendingTradeOffer;
    if (!offer || offer.fromIdx === playerIdx || offer.respondedBots.includes(playerIdx)) return { valid: false };

    if (accept) {
      if (!hasResources(this.players[playerIdx].resources, offer.want)) return { valid: false, reason: "Doesn't have those resources." };
      payResources(this.players[offer.fromIdx].resources, offer.give);
      payResources(this.players[playerIdx].resources, offer.want);
      for (const [res, amt] of Object.entries(offer.give)) this.players[playerIdx].resources[res] += amt;
      for (const [res, amt] of Object.entries(offer.want)) this.players[offer.fromIdx].resources[res] += amt;
      this.pushLog(`${this.nameFor(playerIdx)} accepted the trade with ${this.nameFor(offer.fromIdx)}.`);
      this.pendingTradeOffer = null;
    } else {
      offer.respondedBots.push(playerIdx);
      const others = this.numPlayers - 1;
      if (offer.respondedBots.length >= others) {
        this.pushLog("No one accepted the trade.");
        this.pendingTradeOffer = null;
      }
    }
    this.emit();
    return { valid: true };
  }

  cancelPlayerTrade(fromIdx) {
    if (!this.pendingTradeOffer || this.pendingTradeOffer.fromIdx !== fromIdx) return { valid: false };
    this.pendingTradeOffer = null;
    this.emit();
    return { valid: true };
  }

  offerBotTrade(botIdx, give, want) {
    if (this.pendingBotTradeOffer) return { valid: false };
    this.pendingBotTradeOffer = { fromIdx: botIdx, give, want };
    this.pushLog(`${this.nameFor(botIdx)} offers a trade.`);
    this.emit();
    return { valid: true };
  }

  respondToBotTrade(accept) {
    const offer = this.pendingBotTradeOffer;
    if (!offer) return { valid: false };
    if (accept) {
      if (!hasResources(this.players[0].resources, offer.want)) return { valid: false, reason: "You don't have those resources." };
      payResources(this.players[offer.fromIdx].resources, offer.give);
      payResources(this.players[0].resources, offer.want);
      for (const [res, amt] of Object.entries(offer.give)) this.players[0].resources[res] += amt;
      for (const [res, amt] of Object.entries(offer.want)) this.players[offer.fromIdx].resources[res] += amt;
      this.pushLog(`You accepted ${this.nameFor(offer.fromIdx)}'s trade.`);
    } else {
      this.pushLog(`You declined ${this.nameFor(offer.fromIdx)}'s trade.`);
    }
    this.pendingBotTradeOffer = null;
    this.emit();
    return { valid: true };
  }

  // ---------- turn lifecycle ----------

  endTurn(playerIdx) {
    if (this.turnPhase !== "actions" || playerIdx !== this.currentPlayerIndex) return { valid: false };
    this.pendingTradeOffer = null;
    this.pendingBotTradeOffer = null;
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.numPlayers;
    this.turnNumber++;
    this.devCardPlayedThisTurn = false;
    this.dice = [0, 0];
    this.turnPhase = "preRoll";
    this.pushLog(`${this.nameFor(this.currentPlayerIndex)}'s turn.`);
    this.emit();
    return { valid: true };
  }

  // ---------- bonuses & win ----------

  recomputeLongestRoad() {
    const lengths = this.players.map((p) => longestRoadLength(this.board, p.id));
    this.roadLengths = lengths;
    let ownerIdx = this.longestRoadOwner;
    let ownerLen = ownerIdx != null ? lengths[ownerIdx] : 0;
    if (ownerIdx != null && ownerLen < 5) { ownerIdx = null; ownerLen = 0; }
    lengths.forEach((len, i) => {
      if (len >= 5 && (ownerIdx == null || len > ownerLen)) { ownerIdx = i; ownerLen = len; }
    });
    if (ownerIdx !== this.longestRoadOwner) {
      this.longestRoadOwner = ownerIdx;
      if (ownerIdx != null) this.pushLog(`${this.nameFor(ownerIdx)} takes Longest Road.`);
    }
  }

  recomputeLargestArmy() {
    let ownerIdx = this.largestArmyOwner;
    let ownerCount = ownerIdx != null ? this.players[ownerIdx].knightsPlayed : 0;
    this.players.forEach((p) => {
      if (p.knightsPlayed >= 3 && (ownerIdx == null || p.knightsPlayed > ownerCount)) { ownerIdx = p.id; ownerCount = p.knightsPlayed; }
    });
    if (ownerIdx !== this.largestArmyOwner) {
      this.largestArmyOwner = ownerIdx;
      if (ownerIdx != null) this.pushLog(`${this.nameFor(ownerIdx)} takes Largest Army.`);
    }
  }

  checkWin(playerIdx) {
    if (this.phase === "gameOver") return;
    if (totalVictoryPoints(this, playerIdx) >= 10) {
      this.phase = "gameOver";
      this.turnPhase = "gameOver";
      this.winner = playerIdx;
      this.pushLog(`${this.nameFor(playerIdx)} wins with ${totalVictoryPoints(this, playerIdx)} victory points!`);
    }
  }
}
