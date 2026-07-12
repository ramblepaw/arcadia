import { Game, TOTAL_PYRAMID_CARDS } from "./game.js";
import * as ui from "./ui.js";
import { getMe, recordPlay } from "/api-client.js";

let game = null;

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    const remaining = finishedGame.remaining();
    await recordPlay({
      gameSlug: "pyramid",
      score: remaining,
      result: finishedGame.outcome,
      details: {
        movesUsed: finishedGame.moves,
        cardsCleared: TOTAL_PYRAMID_CARDS - remaining,
        stockRemaining: finishedGame.stockCount(),
      },
    });
  } catch (err) {
    console.warn("[pyramid] could not record game result:", err);
  }
}

function render() {
  ui.renderAll(game, {
    onPlayCell: (r, c) => game.playCell(r, c),
    onDraw: () => game.draw(),
  });

  if (game.isGameOver) {
    const modal = document.getElementById("game-over-modal");
    if (modal.classList.contains("hidden")) {
      ui.showGameOverModal(game);
      reportGameResult(game);
    }
  }
}

function startGame() {
  game = new Game();
  game.subscribe(render);
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-over-modal").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  render();
}

document.getElementById("start-btn").addEventListener("click", startGame);

document.getElementById("rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.remove("hidden");
});

document.getElementById("close-rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.add("hidden");
});

document.getElementById("play-again-btn").addEventListener("click", () => {
  startGame();
});

document.getElementById("main-menu-btn").addEventListener("click", () => {
  const midGame = game && !game.isGameOver;
  if (midGame && !confirm("Leave this game in progress? Your current game will be lost.")) {
    return;
  }
  location.href = "../../index.html";
});
