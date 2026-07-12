import { Game } from "./game.js";
import * as ui from "./ui.js";
import { getMe, recordPlay } from "/api-client.js";

let game = null;
let flagMode = false;
let timerInterval = null;

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    await recordPlay({
      gameSlug: "minesweeper",
      score: finishedGame.elapsedSeconds(),
      result: finishedGame.outcome,
      details: {
        difficulty: finishedGame.difficultyKey,
        rows: finishedGame.config.rows,
        cols: finishedGame.config.cols,
        mines: finishedGame.config.mines,
      },
    });
  } catch (err) {
    console.warn("[minesweeper] could not record game result:", err);
  }
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimerLoop() {
  stopTimer();
  timerInterval = setInterval(() => {
    if (!game || game.isGameOver) {
      stopTimer();
      return;
    }
    ui.updateTimerDisplay(game);
  }, 1000);
}

function onCellClick(r, c) {
  if (flagMode) {
    game.toggleFlag(r, c);
  } else {
    game.reveal(r, c);
  }
}

function render() {
  ui.renderAll(game, {
    onCellClick,
    onFlag: (r, c) => game.toggleFlag(r, c),
    onChord: (r, c) => game.chord(r, c),
  });

  if (game.minesPlaced && !game.isGameOver && !timerInterval) {
    startTimerLoop();
  }

  if (game.isGameOver) {
    stopTimer();
    ui.updateTimerDisplay(game);
    const modal = document.getElementById("game-over-modal");
    if (modal.classList.contains("hidden")) {
      ui.showGameOverModal(game);
      reportGameResult(game);
    }
  }
}

function startGame(difficultyKey) {
  stopTimer();
  flagMode = false;
  document.getElementById("flag-mode-btn").classList.remove("active");
  game = new Game(difficultyKey);
  game.subscribe(render);
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-over-modal").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  document.getElementById("difficulty-label").textContent = game.config.label;
  render();
}

document.querySelectorAll(".difficulty-btn").forEach((btn) => {
  btn.addEventListener("click", () => startGame(btn.dataset.difficulty));
});

document.getElementById("rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.remove("hidden");
});

document.getElementById("close-rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.add("hidden");
});

document.getElementById("play-again-btn").addEventListener("click", () => {
  startGame(game.difficultyKey);
});

document.getElementById("flag-mode-btn").addEventListener("click", () => {
  flagMode = !flagMode;
  document.getElementById("flag-mode-btn").classList.toggle("active", flagMode);
});

document.getElementById("reset-face").addEventListener("click", () => {
  const midGame = game && !game.isGameOver && game.minesPlaced;
  if (midGame && !confirm("Start a new game? Your current game will be lost.")) return;
  startGame(game.difficultyKey);
});

document.getElementById("main-menu-btn").addEventListener("click", () => {
  const midGame = game && !game.isGameOver && game.minesPlaced;
  if (midGame && !confirm("Leave this game in progress? Your current game will be lost.")) {
    return;
  }
  location.href = "../../index.html";
});
