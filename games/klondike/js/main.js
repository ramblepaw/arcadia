import { Game } from "./game.js";
import * as ui from "./ui.js";
import { getMe, recordPlay } from "/api-client.js";

let game = null;

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    await recordPlay({
      gameSlug: "klondike",
      score: finishedGame.score,
      result: finishedGame.outcome,
      details: {
        movesUsed: finishedGame.moves,
        foundationCards: finishedGame.foundationCount(),
        redealsUsed: finishedGame.redeals,
        drawCount: finishedGame.drawCount,
        cardsRemaining: finishedGame.remaining(),
      },
    });
  } catch (err) {
    console.warn("[klondike] could not record game result:", err);
  }
}

function render() {
  ui.renderAll(game, {
    onDraw: () => game.draw(),
    onClickWaste: () => game.selectWaste(),
    onDblClickWaste: () => game.autoMoveWasteToFoundation(),
    onClickFoundation: (suit) => game.clickFoundation(suit),
    onClickTableau: (col, index) => game.selectTableau(col, index),
    onDblClickTableau: (col) => game.autoMoveTableauToFoundation(col),
    onClickEmptyColumn: (col) => game.clickEmptyColumn(col),
  });

  if (game.isGameOver) {
    const modal = document.getElementById("game-over-modal");
    if (modal.classList.contains("hidden")) {
      ui.showGameOverModal(game);
      reportGameResult(game);
    }
  }
}

function getSelectedDrawCount() {
  const checked = document.querySelector('input[name="draw-count"]:checked');
  return checked ? Number(checked.value) : 1;
}

function startGame() {
  game = new Game(getSelectedDrawCount());
  game.subscribe(render);
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-over-modal").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  render();
}

document.getElementById("start-btn").addEventListener("click", startGame);

document.getElementById("undo-btn").addEventListener("click", () => {
  if (game) game.undo();
});

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
