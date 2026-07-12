import { Game } from "./game.js";
import * as ui from "./ui.js";
import { getMe, recordPlay } from "/api-client.js";

let game = null;

async function reportGameResult(finishedGame) {
  // Only completed wins are meaningful data here - Spider has no forced-
  // loss state, so an abandoned/quit game never reaches gameOver.
  if (finishedGame.outcome !== "win") return;
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    const remaining = finishedGame.remaining();
    await recordPlay({
      gameSlug: "spider",
      score: remaining,
      result: finishedGame.outcome,
      details: {
        movesUsed: finishedGame.moves,
        suitCount: finishedGame.suitCount,
        sequencesCompleted: finishedGame.sequencesCompleted,
      },
    });
  } catch (err) {
    console.warn("[spider] could not record game result:", err);
  }
}

function render() {
  ui.renderAll(game, {
    onCardClick: (col, index) => game.selectCard(col, index),
    onEmptyColumnClick: (col) => game.selectEmptyColumn(col),
    onDeal: () => game.dealFromStock(),
  });

  if (game.isGameOver) {
    const modal = document.getElementById("game-over-modal");
    if (modal.classList.contains("hidden")) {
      ui.showGameOverModal(game);
      reportGameResult(game);
    }
  }
}

function getSelectedSuitCount() {
  const checked = document.querySelector('input[name="suit-count"]:checked');
  return checked ? Number(checked.value) : 1;
}

function startGame() {
  const suitCount = getSelectedSuitCount();
  game = new Game(suitCount);
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
