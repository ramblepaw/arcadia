import { Game } from "./game.js";
import * as ui from "./ui.js";
import { getMe, recordPlay, trackAbandonment } from "/api-client.js";

let game = null;

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    await recordPlay({
      gameSlug: "freecell",
      score: finishedGame.points,
      result: finishedGame.outcome,
      details: {
        movesUsed: finishedGame.moves,
        cardsRemaining: finishedGame.score(),
      },
    });
  } catch (err) {
    console.warn("[freecell] could not record game result:", err);
  }
}

trackAbandonment("freecell", () => {
  if (!game || game.isGameOver) return null;
  return {
    score: game.points,
    details: { movesUsed: game.moves, cardsRemaining: game.score() },
  };
});

function render() {
  ui.renderAll(game, {
    onTableauCardClick: (col, index) => game.onTableauCardClick(col, index),
    onEmptyColumnClick: (col) => game.onEmptyColumnClick(col),
    onFreeCellClick: (cell) => game.onFreeCellClick(cell),
    onFoundationClick: (suit) => game.onFoundationClick(suit),
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
