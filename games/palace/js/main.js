import { Game } from "./game.js";
import { chooseSwapPairs, choosePlay, chooseFaceDownCardId } from "./bot.js";
import * as ui from "./ui.js";
import { getMe, recordPlay, trackAbandonment } from "/api-client.js";

const BOT_STEP_DELAY = 1100;

let game = null;
let botTimer = null;

function renderSwap() {
  ui.renderSwapScreen(game, {
    onSwap: (handId, faceUpId) => {
      game.swapCards(0, handId, faceUpId);
      renderSwap();
    },
    onRerender: renderSwap,
  });
}

function render() {
  ui.renderAll(game, {
    onFlipFaceDown: (cardId) => {
      game.flipFaceDown(0, cardId);
    },
    onRerender: render,
  });
}

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    const human = finishedGame.players.find((p) => p.isHuman);
    const result = human.finishRank === finishedGame.numPlayers ? "loss" : "win";

    await recordPlay({
      gameSlug: "palace",
      score: human.finishRank,
      result,
      details: { numPlayers: finishedGame.numPlayers, finishRank: human.finishRank },
    });
  } catch (err) {
    console.warn("[palace] could not record game result:", err);
  }
}

function onStateChange() {
  if (game.phase === "swap") {
    renderSwap();
    return;
  }

  document.getElementById("swap-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
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

  if (!game.currentPlayer.isHuman) {
    scheduleBotStep();
  }
}

trackAbandonment("palace", () => {
  if (!game || game.isGameOver) return null;
  return {
    score: game.numPlayers,
    details: { numPlayers: game.numPlayers, finishRank: game.numPlayers },
  };
});

function scheduleBotStep() {
  if (botTimer) clearTimeout(botTimer);
  botTimer = setTimeout(runBotStep, BOT_STEP_DELAY);
}

function runBotStep() {
  botTimer = null;
  if (game.isGameOver || game.currentPlayer.isHuman) return;

  const idx = game.currentPlayerIndex;
  const bot = game.players[idx];
  const zone = game.activeZoneName(bot);

  if (zone === "faceDown") {
    const cardId = chooseFaceDownCardId(bot.faceDown);
    if (cardId) game.flipFaceDown(idx, cardId);
    return;
  }
  if (zone === null) return;

  const cardIds = choosePlay(bot[zone], game.pileRequirement, game.pile.length);
  if (cardIds && cardIds.length > 0) {
    game.playCards(idx, cardIds);
  } else {
    game.pickUpPile(idx);
  }
}

function startGame(numBots) {
  game = new Game(numBots);

  for (let i = 1; i <= numBots; i++) {
    const bot = game.players[i];
    const pairs = chooseSwapPairs(bot.hand, bot.faceUp);
    pairs.forEach((pair) => game.swapCards(i, pair.handCardId, pair.faceUpCardId));
    game.finishSwap(i);
  }

  game.subscribe(onStateChange);
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("swap-screen").classList.remove("hidden");
  renderSwap();
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

document.getElementById("swap-ready-btn").addEventListener("click", () => {
  game.finishSwap(0);
});

document.getElementById("sort-rank-btn").addEventListener("click", () => {
  ui.sortHandByRank(game);
  render();
});

document.getElementById("sort-suit-btn").addEventListener("click", () => {
  ui.sortHandBySuit(game);
  render();
});

document.getElementById("play-btn").addEventListener("click", () => {
  const ids = ui.getSelectedCardIds();
  const result = game.playCards(0, ids);
  if (result.valid) {
    ui.resetSelection();
  } else {
    ui.setStatus(result.reason);
    render();
  }
});

document.getElementById("pickup-btn").addEventListener("click", () => {
  const ok = game.pickUpPile(0);
  ui.resetSelection();
  if (!ok) render();
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
