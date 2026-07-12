import { Game } from "./game.js";
import * as ui from "./ui.js";
import { getMe, recordPlay } from "/api-client.js";

let game = null;

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record
    if (finishedGame.outcome !== "win") return; // only completed wins are meaningful here

    await recordPlay({
      gameSlug: "freecell",
      score: finishedGame.score(),
      result: finishedGame.outcome,
      details: {
        movesUsed: finishedGame.moves,
      },
    });
  } catch (err) {
    console.warn("[freecell] could not record game result:", err);
  }
}

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
