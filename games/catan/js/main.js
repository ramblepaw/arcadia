import { Game } from "./game.js";
import {
  decideSetupSettlement, decideSetupRoad, decideDiscard, decideRobberHex, decideRobberVictim,
  decideMainAction, decideAcceptTrade,
} from "./bot.js";
import { totalVictoryPoints } from "./rules.js";
import * as ui from "./ui.js";
import { getMe, recordPlay, trackAbandonment } from "/api-client.js";

const BOT_STEP_DELAY = 900;

let game = null;
let botTimer = null;

const uiState = {
  mode: null, // null | "settlement" | "city" | "road" | "roadBuilding"
  roadBuildingCardIndex: null,
  roadBuildingPicked: [],
  devCardPicker: null, // { cardIndex, type, picks: [] }
  tradeOpen: false,
  tradeTab: "bank",
  bankDraft: { give: "wood", want: "brick" },
  playerDraft: { give: {}, want: {} },
};

function resetPlacementMode() {
  uiState.mode = null;
  uiState.roadBuildingCardIndex = null;
  uiState.roadBuildingPicked = [];
}

function render() {
  ui.renderAll(game, uiState, handlers);
}

function commitRoadBuilding() {
  game.playDevCard(0, uiState.roadBuildingCardIndex, { edgeIds: uiState.roadBuildingPicked });
  resetPlacementMode();
}

const handlers = {
  onRollDice: () => game.rollDice(0),

  onSetMode: (mode) => { uiState.mode = uiState.mode === mode ? null : mode; render(); },
  onCancelMode: () => { resetPlacementMode(); render(); },

  onNodeClick: (nodeId) => {
    if (game.phase === "setup") {
      if (game.currentSetupPlayerIdx() !== 0) return;
      if (game.setupState.subPhase === "settlement") game.placeSetupSettlement(0, nodeId);
      return;
    }
    if (game.turnPhase !== "actions" || game.currentPlayerIndex !== 0) return;
    if (uiState.mode === "settlement") {
      const result = game.buildSettlement(0, nodeId);
      if (result.valid) resetPlacementMode();
    } else if (uiState.mode === "city") {
      const result = game.buildCity(0, nodeId);
      if (result.valid) resetPlacementMode();
    }
    render();
  },

  onEdgeClick: (edgeId) => {
    if (game.phase === "setup") {
      if (game.currentSetupPlayerIdx() !== 0) return;
      if (game.setupState.subPhase === "road") game.placeSetupRoad(0, edgeId);
      return;
    }
    if (game.turnPhase !== "actions" || game.currentPlayerIndex !== 0) return;
    if (uiState.mode === "road") {
      const result = game.buildRoad(0, edgeId);
      if (result.valid) resetPlacementMode();
      render();
    } else if (uiState.mode === "roadBuilding") {
      if (uiState.roadBuildingPicked.includes(edgeId)) return;
      if (!game.legalRoadEdges(0).includes(edgeId)) return;
      uiState.roadBuildingPicked.push(edgeId);
      if (uiState.roadBuildingPicked.length >= 2) commitRoadBuilding();
      else render();
    }
  },

  onHexClick: (hexId) => {
    if (game.turnPhase !== "robberMove" || game.currentPlayerIndex !== 0) return;
    game.moveRobber(0, hexId);
  },

  onBuyDevCard: () => game.buyDevCard(0),

  onPlayDevCard: (cardIndex, type) => {
    if (type === "knight") {
      game.playDevCard(0, cardIndex);
    } else if (type === "roadBuilding") {
      uiState.mode = "roadBuilding";
      uiState.roadBuildingCardIndex = cardIndex;
      uiState.roadBuildingPicked = [];
      render();
    } else if (type === "yearOfPlenty" || type === "monopoly") {
      uiState.devCardPicker = { cardIndex, type, picks: [] };
      render();
    }
  },

  onDevCardPick: (resource) => {
    const picker = uiState.devCardPicker;
    if (!picker) return;
    const max = picker.type === "monopoly" ? 1 : 2;
    picker.picks = picker.picks.length < max ? [...picker.picks, resource] : [resource];
    render();
  },
  onConfirmDevCardPicker: () => {
    const picker = uiState.devCardPicker;
    if (!picker) return;
    const params = picker.type === "monopoly" ? { resource: picker.picks[0] } : { resources: picker.picks };
    game.playDevCard(0, picker.cardIndex, params);
    uiState.devCardPicker = null;
  },
  onCancelDevCardPicker: () => { uiState.devCardPicker = null; render(); },

  onDiscard: (counts) => game.discardResources(0, counts),
  onStealVictim: (idx) => game.stealResource(0, idx),

  onOpenTrade: () => { uiState.tradeOpen = true; uiState.playerDraft = { give: {}, want: {} }; render(); },
  onCloseTrade: () => { uiState.tradeOpen = false; render(); },
  onSetTradeTab: (tab) => { uiState.tradeTab = tab; render(); },
  onBankDraftChange: (partial) => { Object.assign(uiState.bankDraft, partial); render(); },
  onBankTradeConfirm: () => {
    const { give, want } = uiState.bankDraft;
    if (give && want && give !== want) game.bankTrade(0, give, want);
  },
  onPlayerDraftChange: (side, res, val) => { uiState.playerDraft[side][res] = val; render(); },
  onProposeTrade: () => {
    const give = {};
    const want = {};
    for (const [r, v] of Object.entries(uiState.playerDraft.give)) if (v > 0) give[r] = v;
    for (const [r, v] of Object.entries(uiState.playerDraft.want)) if (v > 0) want[r] = v;
    if (Object.keys(give).length === 0 && Object.keys(want).length === 0) return;
    const result = game.proposePlayerTrade(0, give, want);
    if (result.valid) { uiState.tradeOpen = false; render(); }
  },

  onRespondBotTrade: (accept) => game.respondToBotTrade(accept),

  onEndTurn: () => game.endTurn(0),
  onPlayAgain: () => location.reload(),
};

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return;

    const human = finishedGame.players[0];
    const result = finishedGame.winner === 0 ? "win" : "loss";

    await recordPlay({
      gameSlug: "catan",
      score: totalVictoryPoints(finishedGame, 0),
      result,
      details: {
        numPlayers: finishedGame.numPlayers,
        winner: finishedGame.winner,
        victoryPoints: totalVictoryPoints(finishedGame, 0),
      },
    });
  } catch (err) {
    console.warn("[catan] could not record game result:", err);
  }
}

trackAbandonment("catan", () => {
  if (!game || game.isGameOver) return null;
  return {
    score: 0,
    details: { numPlayers: game.numPlayers, victoryPoints: totalVictoryPoints(game, 0) },
  };
});

function scheduleBotStep(fn) {
  if (botTimer) clearTimeout(botTimer);
  botTimer = setTimeout(() => { botTimer = null; fn(); }, BOT_STEP_DELAY);
}

function onStateChange() {
  render();

  if (game.isGameOver) {
    if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    reportGameResult(game);
    return;
  }

  if (game.phase === "setup") {
    if (game.currentSetupPlayerIdx() !== 0) scheduleBotStep(runBotSetupStep);
    return;
  }

  if (game.turnPhase === "discard") {
    if (game.pendingDiscards.some((d) => d.playerIdx !== 0)) scheduleBotStep(runBotDiscardStep);
    return;
  }

  if (game.turnPhase === "robberMove") {
    if (game.currentPlayerIndex !== 0) scheduleBotStep(runBotRobberMoveStep);
    return;
  }

  if (game.turnPhase === "robberSteal") {
    if (game.currentPlayerIndex !== 0) scheduleBotStep(runBotStealStep);
    return;
  }

  if (game.pendingTradeOffer) {
    const others = game.numPlayers - 1;
    if (game.pendingTradeOffer.respondedBots.length < others) scheduleBotStep(runBotTradeResponseStep);
    return;
  }

  if (game.pendingBotTradeOffer) return; // waiting on the human to respond

  if (game.currentPlayerIndex === 0) return;

  if (game.turnPhase === "preRoll") scheduleBotStep(runBotRollStep);
  else if (game.turnPhase === "actions") scheduleBotStep(runBotMainActionStep);
}

function runBotSetupStep() {
  if (game.isGameOver || game.phase !== "setup") return;
  const idx = game.currentSetupPlayerIdx();
  if (idx === 0) return;
  if (game.setupState.subPhase === "settlement") {
    game.placeSetupSettlement(idx, decideSetupSettlement(idx, game));
  } else {
    game.placeSetupRoad(idx, decideSetupRoad(idx, game));
  }
}

function runBotDiscardStep() {
  if (game.isGameOver || game.turnPhase !== "discard") return;
  const entry = game.pendingDiscards.find((d) => d.playerIdx !== 0);
  if (!entry) return;
  game.discardResources(entry.playerIdx, decideDiscard(entry.playerIdx, game, entry.count));
}

function runBotRobberMoveStep() {
  if (game.isGameOver || game.turnPhase !== "robberMove" || game.currentPlayerIndex === 0) return;
  const idx = game.currentPlayerIndex;
  game.moveRobber(idx, decideRobberHex(idx, game));
}

function runBotStealStep() {
  if (game.isGameOver || game.turnPhase !== "robberSteal" || !game.pendingSteal || game.currentPlayerIndex === 0) return;
  const idx = game.currentPlayerIndex;
  game.stealResource(idx, decideRobberVictim(idx, game, game.pendingSteal.victimOptions));
}

function runBotTradeResponseStep() {
  const offer = game.pendingTradeOffer;
  if (game.isGameOver || !offer) return;
  for (let i = 1; i < game.numPlayers; i++) {
    if (i === offer.fromIdx || offer.respondedBots.includes(i)) continue;
    game.respondToPlayerTrade(i, decideAcceptTrade(i, game, offer));
    return;
  }
}

function runBotRollStep() {
  if (game.isGameOver || game.turnPhase !== "preRoll" || game.currentPlayerIndex === 0) return;
  game.rollDice(game.currentPlayerIndex);
}

function runBotMainActionStep() {
  if (game.isGameOver || game.turnPhase !== "actions" || game.currentPlayerIndex === 0 || game.pendingBotTradeOffer) return;
  const idx = game.currentPlayerIndex;
  const action = decideMainAction(idx, game);
  switch (action.type) {
    case "buildCity": game.buildCity(idx, action.nodeId); break;
    case "buildSettlement": game.buildSettlement(idx, action.nodeId); break;
    case "buildRoad": game.buildRoad(idx, action.edgeId); break;
    case "buyDevCard": game.buyDevCard(idx); break;
    case "playDevCard": game.playDevCard(idx, action.cardIndex, action.params || {}); break;
    case "bankTrade": game.bankTrade(idx, action.give, action.want); break;
    case "offerTrade": game.offerBotTrade(idx, action.give, action.want); break;
    default: game.endTurn(idx); break;
  }
}

function startGame(numBots) {
  game = new Game(numBots);
  game.subscribe(onStateChange);
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  onStateChange();
}

document.getElementById("start-btn").addEventListener("click", () => {
  const numBots = parseInt(document.getElementById("bot-count").value, 10);
  startGame(numBots);
});

document.getElementById("rules-btn").addEventListener("click", ui.showRules);
document.getElementById("close-rules-btn").addEventListener("click", ui.hideRules);

document.getElementById("main-menu-btn").addEventListener("click", () => {
  const midGame = game && !game.isGameOver;
  if (midGame && !confirm("Leave this game in progress? Your current game will be lost.")) return;
  location.href = "../../index.html";
});
