import { Game } from "./game.js";
import { decideBotMove } from "./bot.js";
import * as ui from "./ui.js";
import { getMe, recordPlay, trackAbandonment } from "/api-client.js";

const BOT_STEP_DELAY = 700;

let game = null;
let botTimer = null;

function render() {
  ui.renderAll(game, {
    onSelectCard: (cardId) => {
      const current = ui.getSelectedCard();
      ui.setSelectedCard(cardId === current ? null : cardId);
      render();
    },
    onPlaceChip: (cellId) => {
      const cardId = ui.getSelectedCard();
      if (cardId) game.playCard(0, cardId, cellId);
    },
    onRemoveChip: (cellId) => {
      const cardId = ui.getSelectedCard();
      if (cardId) game.removeChip(0, cardId, cellId);
    },
    onCancelSelection: () => { ui.setSelectedCard(null); render(); },
    onDiscardDead: (cardId) => { if (cardId) game.discardDeadCard(0, cardId); },
  });
}

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    const human = finishedGame.players.find((p) => p.isHuman);
    const result = finishedGame.winnerId === human.id ? "win" : "loss";

    await recordPlay({
      gameSlug: "sequence",
      score: human.sequenceCount,
      result,
      details: { numPlayers: finishedGame.numPlayers, sequenceCount: human.sequenceCount, sequencesToWin: finishedGame.sequencesToWin },
    });
  } catch (err) {
    console.warn("[sequence] could not record game result:", err);
  }
}

trackAbandonment("sequence", () => {
  if (!game || game.isGameOver) return null;
  const human = game.players.find((p) => p.isHuman);
  return {
    score: human.sequenceCount,
    details: { numPlayers: game.numPlayers, sequenceCount: human.sequenceCount, sequencesToWin: game.sequencesToWin },
  };
});

function scheduleBotStep() {
  if (botTimer) clearTimeout(botTimer);
  botTimer = setTimeout(runBotStep, BOT_STEP_DELAY);
}

function runBotStep() {
  botTimer = null;
  if (game.gameOver || game.currentPlayer.isHuman) return;
  const idx = game.currentPlayerIndex;
  const action = decideBotMove(game, idx);
  if (!action) return;
  if (action.type === "place") game.playCard(idx, action.cardId, action.cellId);
  else if (action.type === "remove") game.removeChip(idx, action.cardId, action.cellId);
  else if (action.type === "deadDiscard") game.discardDeadCard(idx, action.cardId);
}

function onStateChange() {
  ui.setSelectedCard(null);
  render();

  if (game.gameOver) {
    if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    const modal = document.getElementById("game-over-modal");
    if (modal.classList.contains("hidden")) {
      ui.showGameOverModal(game);
      reportGameResult(game);
    }
    return;
  }

  if (!game.currentPlayer.isHuman) scheduleBotStep();
}

function startGame(numBots) {
  game = new Game(numBots);
  ui.resetSelection();
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
