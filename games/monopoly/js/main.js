import { Game } from "./game.js";
import {
  decideBuyProperty, decideAuctionBid, decideJailAction,
  decideNextPostRollAction, decideLiquidationAction, decideAcceptTrade,
} from "./bot.js";
import { netWorth } from "./rules.js";
import * as ui from "./ui.js";
import { getMe, recordPlay, trackAbandonment } from "/api-client.js";

const BOT_STEP_DELAY = 1100;

let game = null;
let botTimer = null;

function render() {
  ui.renderAll(game, {
    onRerender: render,
    onRollDice: () => game.rollDice(0),
    onBuy: () => game.buyProperty(0),
    onDecline: () => game.declineBuy(0),
    onJailAction: (action) => game.jailAction(0, action),
    onEndTurn: () => game.endPostRollActions(0),
    onOpenManage: () => { ui.openManageModal(); render(); },
    onCloseManage: () => { ui.closeManageModal(); render(); },
    onBuildHouse: (spaceId) => game.buildHouse(0, spaceId),
    onSellHouse: (spaceId) => game.sellHouse(0, spaceId),
    onMortgage: (spaceId) => game.mortgageProperty(0, spaceId),
    onUnmortgage: (spaceId) => game.unmortgageProperty(0, spaceId),
    onOpenTrade: () => { ui.openTradeModal(); render(); },
    onCloseTrade: () => { ui.closeTradeModal(); render(); },
    onProposeTrade: ({ toIdx, offer, request }) => {
      const result = game.proposeTrade(0, toIdx, offer, request);
      if (result.valid) { ui.closeTradeModal(); render(); }
      else { ui.setTradeError(result.reason); render(); }
    },
    onAcknowledgeCard: () => game.acknowledgeCard(0),
    onPlaceBid: (amount) => game.placeBid(0, amount),
    onPassAuction: () => game.passAuction(0),
    onLiquidate: (step) => game.liquidateAction(0, step),
    onDeclareBankruptcy: () => game.declareBankruptcy(0),
  });
}

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    const human = finishedGame.players.find((p) => p.isHuman);
    const result = human.finishRank === 1 ? "win" : "loss";

    await recordPlay({
      gameSlug: "monopoly",
      score: human.finishRank,
      result,
      details: {
        numPlayers: finishedGame.numPlayers,
        finishRank: human.finishRank,
        netWorthAtEnd: netWorth(finishedGame, human.id),
      },
    });
  } catch (err) {
    console.warn("[monopoly] could not record game result:", err);
  }
}

trackAbandonment("monopoly", () => {
  if (!game || game.isGameOver) return null;
  return {
    score: game.numPlayers,
    details: { numPlayers: game.numPlayers, finishRank: game.numPlayers },
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
    const modal = document.getElementById("game-over-modal");
    if (modal.classList.contains("hidden")) {
      ui.showGameOverModal(game);
      reportGameResult(game);
    }
    return;
  }

  if (game.mustRaiseCash) {
    if (game.mustRaiseCash.playerIdx !== 0) scheduleBotStep(runBotLiquidationStep);
    return;
  }

  if (game.auction) {
    const bidder = game.nextAuctionBidder();
    if (bidder !== null && bidder !== 0) scheduleBotStep(runBotAuctionStep);
    return;
  }

  if (game.pendingTrade) {
    if (game.pendingTrade.toIdx !== 0) scheduleBotStep(runBotTradeResponseStep);
    return;
  }

  if (game.pendingCard) {
    if (game.currentPlayerIndex !== 0) scheduleBotStep(runBotCardAckStep);
    return;
  }

  if (game.currentPlayer.isHuman) return;

  if (game.turnPhase === "jailDecision") scheduleBotStep(runBotJailStep);
  else if (game.turnPhase === "rollDice") scheduleBotStep(runBotRollStep);
  else if (game.turnPhase === "buyDecision") scheduleBotStep(runBotBuyStep);
  else if (game.turnPhase === "postRollActions") scheduleBotStep(runBotPostRollStep);
}

function runBotLiquidationStep() {
  if (game.isGameOver || !game.mustRaiseCash || game.mustRaiseCash.playerIdx === 0) return;
  const idx = game.mustRaiseCash.playerIdx;
  const action = decideLiquidationAction(idx, game);
  if (action.type === "bankrupt") game.declareBankruptcy(idx);
  else game.liquidateAction(idx, action);
}

function runBotAuctionStep() {
  if (game.isGameOver || !game.auction) return;
  const idx = game.nextAuctionBidder();
  if (idx === null || idx === 0) return;
  const bidAmount = decideAuctionBid(idx, game, game.auction);
  if (bidAmount) game.placeBid(idx, bidAmount);
  else game.passAuction(idx);
}

function runBotTradeResponseStep() {
  if (game.isGameOver || !game.pendingTrade) return;
  const trade = game.pendingTrade;
  if (trade.toIdx === 0) return;
  const accept = decideAcceptTrade(trade.toIdx, game, trade);
  game.respondToTrade(accept);
}

function runBotCardAckStep() {
  if (game.isGameOver || !game.pendingCard || game.currentPlayerIndex === 0) return;
  game.acknowledgeCard(game.currentPlayerIndex);
}

function runBotJailStep() {
  if (game.isGameOver || game.turnPhase !== "jailDecision" || game.currentPlayer.isHuman) return;
  const idx = game.currentPlayerIndex;
  game.jailAction(idx, decideJailAction(idx, game));
}

function runBotRollStep() {
  if (game.isGameOver || game.turnPhase !== "rollDice" || game.currentPlayer.isHuman) return;
  game.rollDice(game.currentPlayerIndex);
}

function runBotBuyStep() {
  if (game.isGameOver || game.turnPhase !== "buyDecision" || game.currentPlayer.isHuman) return;
  const idx = game.currentPlayerIndex;
  const shouldBuy = decideBuyProperty(idx, game, game.pendingBuySpaceId);
  if (shouldBuy) game.buyProperty(idx);
  else game.declineBuy(idx);
}

function runBotPostRollStep() {
  if (game.isGameOver || game.turnPhase !== "postRollActions" || game.currentPlayer.isHuman) return;
  const idx = game.currentPlayerIndex;
  const action = decideNextPostRollAction(idx, game);
  if (action.type === "done") { game.endPostRollActions(idx); return; }
  if (action.type === "buildHouse") game.buildHouse(idx, action.spaceId);
  else if (action.type === "unmortgage") game.unmortgageProperty(idx, action.spaceId);
  else if (action.type === "mortgage") game.mortgageProperty(idx, action.spaceId);
  else if (action.type === "sellHouse") game.sellHouse(idx, action.spaceId);
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

document.getElementById("rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.remove("hidden");
});

document.getElementById("close-rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.add("hidden");
});

document.getElementById("play-again-btn").addEventListener("click", () => {
  location.reload();
});

document.getElementById("main-menu-btn").addEventListener("click", () => {
  const midGame = game && !game.isGameOver;
  if (midGame && !confirm("Leave this game in progress? Your current game will be lost.")) {
    return;
  }
  location.href = "../../index.html";
});
