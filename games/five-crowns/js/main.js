import { Game } from "./game.js";
import { botDecideDraw, chooseDiscard } from "./bot.js";
import * as ui from "./ui.js";

const BOT_STEP_DELAY = 650;

let game = null;
let botTimer = null;

function render() {
  ui.renderAll(game, {
    onDrawStock: () => {
      game.drawFromStock(0);
    },
    onDrawDiscard: () => {
      game.drawFromDiscard(0);
    },
    onRerender: render,
  });
}

function onStateChange() {
  render();

  if (game.roundOver) {
    if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    const modal = document.getElementById("round-modal");
    if (modal.classList.contains("hidden")) {
      ui.showRoundModal(game, () => {
        ui.hideRoundModal();
        if (game.gameOver) {
          ui.showGameOverModal(game);
        } else {
          ui.resetSelection();
          game.nextRound();
        }
      });
    }
    return;
  }

  if (!game.currentPlayer.isHuman) {
    scheduleBotStep();
  }
}

function scheduleBotStep() {
  if (botTimer) clearTimeout(botTimer);
  botTimer = setTimeout(runBotStep, BOT_STEP_DELAY);
}

function runBotStep() {
  botTimer = null;
  if (game.roundOver || game.currentPlayer.isHuman) return;

  const idx = game.currentPlayerIndex;
  const bot = game.players[idx];

  if (game.turnPhase === "draw") {
    const discardTop = game.discard[game.discard.length - 1] || null;
    const source = botDecideDraw(bot.hand, discardTop, game.wildRank);
    if (source === "discard") {
      game.drawFromDiscard(idx);
    } else {
      game.drawFromStock(idx);
    }
    return;
  }

  if (game.turnPhase === "discard") {
    const forbidden = bot.drawnFromDiscard ? bot.drawnCardId : null;
    const card = chooseDiscard(bot.hand, game.wildRank, forbidden);
    if (card) {
      if (game.canGoOutWithCard(idx, card.id)) {
        game.goOut(idx, card.id);
      } else {
        game.discardCard(idx, card.id);
      }
    }
    return;
  }
}

function startGame(numBots) {
  game = new Game(numBots);
  ui.resetSelection();
  game.subscribe(onStateChange);
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  render();
  if (!game.currentPlayer.isHuman) scheduleBotStep();
}

document.getElementById("start-btn").addEventListener("click", () => {
  const numBots = parseInt(document.getElementById("bot-count").value, 10);
  startGame(numBots);
});

document.getElementById("sort-suit-btn").addEventListener("click", () => {
  ui.sortHandBySuit(game);
  render();
});

document.getElementById("sort-rank-btn").addEventListener("click", () => {
  ui.sortHandByRank(game);
  render();
});

document.getElementById("arrange-btn").addEventListener("click", () => {
  ui.autoArrangeHand(game);
  render();
});

document.getElementById("discard-btn").addEventListener("click", () => {
  const selected = ui.getSelectedCardId();
  if (selected) {
    game.discardCard(0, selected);
    ui.resetSelection();
  }
});

document.getElementById("go-out-btn").addEventListener("click", () => {
  const selected = ui.getSelectedCardId();
  if (selected) {
    game.goOut(0, selected);
    ui.resetSelection();
  }
});

document.getElementById("scores-btn").addEventListener("click", () => {
  ui.showScoresModal(game);
});

document.getElementById("close-scores-btn").addEventListener("click", () => {
  ui.hideScoresModal();
});

document.getElementById("play-again-btn").addEventListener("click", () => {
  location.reload();
});
