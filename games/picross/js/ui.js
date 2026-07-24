function clueChip(clue, palette) {
  const chip = document.createElement("div");
  chip.className = "clue-num";
  chip.textContent = String(clue.count);
  chip.style.color = palette[clue.color - 1];
  return chip;
}

function renderColClues(game) {
  const el = document.getElementById("col-clues");
  el.style.setProperty("--cols", game.puzzle.cols);
  el.innerHTML = "";
  for (let c = 0; c < game.puzzle.cols; c++) {
    const cell = document.createElement("div");
    cell.className = "col-clue-cell" + (game.colSolved(c) ? " solved" : "");
    game.targetColClues[c].forEach((clue) => cell.appendChild(clueChip(clue, game.puzzle.colors)));
    el.appendChild(cell);
  }
}

function renderRowClues(game) {
  const el = document.getElementById("row-clues");
  el.innerHTML = "";
  for (let r = 0; r < game.puzzle.rows; r++) {
    const cell = document.createElement("div");
    cell.className = "row-clue-cell" + (game.rowSolved(r) ? " solved" : "");
    game.targetRowClues[r].forEach((clue) => cell.appendChild(clueChip(clue, game.puzzle.colors)));
    el.appendChild(cell);
  }
}

function buildCellEl(game, r, c, handlers) {
  const el = document.createElement("div");
  const value = game.playerGrid[r][c];
  el.className = "cell" + (value ? " filled" : " empty");
  if (value) {
    el.style.backgroundColor = game.puzzle.colors[value - 1];
  } else if (game.marks[r][c]) {
    el.classList.add("marked");
    el.textContent = "✕";
  }
  el.addEventListener("click", () => handlers.onCellClick(r, c));
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    handlers.onToggleMark(r, c);
  });
  return el;
}

function renderBoard(game, handlers) {
  const boardEl = document.getElementById("board");
  boardEl.style.setProperty("--cols", game.puzzle.cols);
  boardEl.innerHTML = "";
  game.playerGrid.forEach((row, r) => {
    row.forEach((_, c) => boardEl.appendChild(buildCellEl(game, r, c, handlers)));
  });
}

function renderPalette(game, handlers) {
  const el = document.getElementById("palette");
  el.innerHTML = "";
  game.puzzle.colors.forEach((hex, i) => {
    const btn = document.createElement("button");
    btn.className = "swatch" + (game.selectedColor === i + 1 ? " active" : "");
    btn.style.backgroundColor = hex;
    btn.title = `Paint color ${i + 1}`;
    btn.addEventListener("click", () => handlers.onSelectColor(i + 1));
    el.appendChild(btn);
  });
}

function renderHud(game) {
  updateTimerDisplay(game);
  document.getElementById("puzzle-label").textContent = `${game.puzzle.title} · ${game.puzzle.rows}×${game.puzzle.cols}`;
  document.getElementById("mark-mode-btn").classList.toggle("active", game.markMode);
}

export function updateTimerDisplay(game) {
  const el = document.getElementById("timer");
  if (el) el.textContent = String(Math.min(game.elapsedSeconds(), 999)).padStart(3, "0");
}

export function renderAll(game, handlers) {
  renderHud(game);
  renderPalette(game, handlers);
  renderColClues(game);
  renderRowClues(game);
  renderBoard(game, handlers);
}

export function showSolvedModal(game) {
  const time = game.elapsedSeconds();
  document.getElementById("solved-detail").textContent =
    `You solved "${game.puzzle.title}" (${game.puzzle.rows}×${game.puzzle.cols}, ${game.puzzle.colors.length} colors) in ${time}s.`;
  document.getElementById("solved-modal").classList.remove("hidden");
}
