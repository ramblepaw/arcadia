import { Game } from "./game.js";
import { botDecideDraw, chooseDiscard } from "./bot.js";
import * as ui from "./ui.js";
import { getMe, recordPlay } from "/api-client.js";

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
          reportGameResult(game);
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

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    const human = finishedGame.players.find((p) => p.isHuman);
    const standings = finishedGame.standings();
    const result = standings[0].id === human.id ? "win" : "loss";

    await recordPlay({
      gameSlug: "five-crowns",
      score: human.totalScore,
      result,
      details: { roundScores: human.roundScores, numPlayers: finishedGame.numPlayers },
    });
  } catch (err) {
    console.warn("[five-crowns] could not record game result:", err);
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

function startGame(numBots, mode) {
  game = new Game(numBots, mode);
  ui.resetSelection();
  game.subscribe(onStateChange);
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  document.getElementById("arrange-btn").classList.toggle("hidden", mode === "manual");
  render();
  if (!game.currentPlayer.isHuman) scheduleBotStep();
}

document.getElementById("start-btn").addEventListener("click", () => {
  const numBots = parseInt(document.getElementById("bot-count").value, 10);
  const mode = document.getElementById("mode-select").value;
  startGame(numBots, mode);
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

document.getElementById("form-group-btn").addEventListener("click", () => {
  const selected = ui.getSelectedCardIds();
  const result = game.formGroup(0, selected);
  if (result.valid) ui.resetSelection();
  render();
  if (!result.valid) {
    document.getElementById("player-status").textContent = result.reason;
  }
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
  if (game && game.gameOver) ui.showGameOverModal(game);
});

document.getElementById("view-score-table-btn").addEventListener("click", () => {
  document.getElementById("game-over-modal").classList.add("hidden");
  ui.showScoresModal(game);
});

document.getElementById("play-again-btn").addEventListener("click", () => {
  location.reload();
});

document.getElementById("main-menu-btn").addEventListener("click", () => {
  const midGame = game && !game.gameOver;
  if (midGame && !confirm("Leave this game in progress? Your current game will be lost.")) {
    return;
  }
  location.href = "../../index.html";
});
