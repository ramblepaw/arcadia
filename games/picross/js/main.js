import { Game } from "./game.js";
import { PUZZLES } from "./puzzles.js";
import * as ui from "./ui.js";
import { getMe, recordPlay, trackAbandonment } from "/api-client.js";

let game = null;
let timerInterval = null;

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    await recordPlay({
      gameSlug: "picross",
      score: finishedGame.elapsedSeconds(),
      result: "win",
      details: {
        puzzle: finishedGame.puzzle.slug,
        rows: finishedGame.puzzle.rows,
        cols: finishedGame.puzzle.cols,
        colors: finishedGame.puzzle.colors.length,
      },
    });
  } catch (err) {
    console.warn("[picross] could not record game result:", err);
  }
}

trackAbandonment("picross", () => {
  if (!game || game.isSolved || !game.startTime) return null;
  return {
    score: game.elapsedSeconds(),
    details: {
      puzzle: game.puzzle.slug,
      rows: game.puzzle.rows,
      cols: game.puzzle.cols,
      colors: game.puzzle.colors.length,
    },
  };
});

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimerLoop() {
  stopTimer();
  timerInterval = setInterval(() => {
    if (!game || game.isSolved) {
      stopTimer();
      return;
    }
    ui.updateTimerDisplay(game);
  }, 1000);
}

function render() {
  ui.renderAll(game, {
    onCellClick: (r, c) => game.paintCell(r, c),
    onToggleMark: (r, c) => game.toggleMark(r, c),
    onSelectColor: (i) => game.setSelectedColor(i),
  });

  if (game.startTime && !game.isSolved && !timerInterval) {
    startTimerLoop();
  }

  if (game.isSolved) {
    stopTimer();
    ui.updateTimerDisplay(game);
    const modal = document.getElementById("solved-modal");
    if (modal.classList.contains("hidden")) {
      ui.showSolvedModal(game);
      reportGameResult(game);
    }
  }
}

function startGame(slug) {
  stopTimer();
  game = new Game(slug);
  game.subscribe(render);
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("solved-modal").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  render();
}

function buildPuzzleList() {
  const list = document.getElementById("puzzle-list");
  PUZZLES.forEach((puzzle) => {
    const btn = document.createElement("button");
    btn.className = "difficulty-btn";
    btn.dataset.puzzle = puzzle.slug;
    btn.innerHTML = `${puzzle.title} <span>${puzzle.rows}&times;${puzzle.cols} &middot; ${puzzle.colors.length} colors &middot; ${puzzle.difficulty}</span>`;
    btn.addEventListener("click", () => startGame(puzzle.slug));
    list.appendChild(btn);
  });
}

buildPuzzleList();

document.getElementById("rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.remove("hidden");
});

document.getElementById("close-rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.add("hidden");
});

document.getElementById("play-again-btn").addEventListener("click", () => {
  startGame(game.puzzle.slug);
});

document.getElementById("mark-mode-btn").addEventListener("click", () => {
  game.toggleMarkMode();
});

document.getElementById("reset-btn").addEventListener("click", () => {
  const midGame = game && !game.isSolved && game.startTime;
  if (midGame && !confirm("Restart this puzzle? Your progress will be lost.")) return;
  startGame(game.puzzle.slug);
});

document.getElementById("main-menu-btn").addEventListener("click", () => {
  const midGame = game && !game.isSolved && game.startTime;
  if (midGame && !confirm("Leave this puzzle in progress? Your current progress will be lost.")) {
    return;
  }
  location.href = "../../index.html";
});
