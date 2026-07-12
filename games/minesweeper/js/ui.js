function cellSymbol(cell) {
  if (!cell.revealed) return cell.flagged ? "\u{1F6A9}" : "";
  if (cell.mine) return "\u{1F4A3}";
  if (cell.adjacent === 0) return "";
  return String(cell.adjacent);
}

function buildCellEl(cell, r, c, handlers, isExploded) {
  const el = document.createElement("div");
  const classes = ["cell"];
  if (cell.revealed) {
    classes.push("revealed");
    if (cell.mine) classes.push("mine");
    if (isExploded) classes.push("exploded");
    if (!cell.mine && cell.adjacent > 0) classes.push(`n${cell.adjacent}`);
  } else {
    classes.push("hidden-cell");
    if (cell.flagged) classes.push("flagged");
  }
  el.className = classes.join(" ");
  el.textContent = cellSymbol(cell);
  el.addEventListener("click", () => handlers.onCellClick(r, c));
  el.addEventListener("dblclick", () => handlers.onChord(r, c));
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    handlers.onFlag(r, c);
  });
  return el;
}

function renderBoard(game, handlers) {
  const boardEl = document.getElementById("board");
  boardEl.style.setProperty("--cols", game.config.cols);
  boardEl.innerHTML = "";
  const exploded = game.explodedCell;
  game.cells.forEach((row, r) => {
    row.forEach((cell, c) => {
      const isExploded = !!exploded && exploded[0] === r && exploded[1] === c;
      boardEl.appendChild(buildCellEl(cell, r, c, handlers, isExploded));
    });
  });
}

function renderHud(game) {
  document.getElementById("mine-counter").textContent = String(Math.max(game.minesRemaining, -99)).padStart(3, "0");
  updateTimerDisplay(game);
  const face = document.getElementById("reset-face");
  face.textContent = game.isGameOver ? (game.outcome === "win" ? "\u{1F60E}" : "\u{1F480}") : "\u{1F642}";
  document.getElementById("status-info").textContent = game.message || "";
}

export function updateTimerDisplay(game) {
  const el = document.getElementById("timer");
  if (el) el.textContent = String(Math.min(game.elapsedSeconds(), 999)).padStart(3, "0");
}

export function renderAll(game, handlers) {
  renderHud(game);
  renderBoard(game, handlers);
}

export function showGameOverModal(game) {
  const time = game.elapsedSeconds();
  document.getElementById("game-over-title").textContent =
    game.outcome === "win" ? "Field Cleared!" : "Boom!";
  document.getElementById("game-over-detail").textContent =
    game.outcome === "win"
      ? `You cleared ${game.config.label} (${game.config.rows}×${game.config.cols}, ${game.config.mines} mines) in ${time}s.`
      : `You hit a mine after ${time}s on ${game.config.label}.`;
  document.getElementById("game-over-modal").classList.remove("hidden");
}
