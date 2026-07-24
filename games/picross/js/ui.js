// ---------- Overview (the assembling picture / panel level-select) ----------

function buildSolvedPanel(mosaic, pr, pc) {
  const el = document.createElement("div");
  el.className = "panel-tile solved";
  el.style.gridColumn = `${pc * mosaic.panelSize + 1} / span ${mosaic.panelSize}`;
  el.style.gridRow = `${pr * mosaic.panelSize + 1} / span ${mosaic.panelSize}`;
  el.style.setProperty("--panel-size", mosaic.panelSize);

  const target = mosaic.panels[pr][pc];
  target.forEach((row) => {
    row.forEach((value) => {
      const px = document.createElement("div");
      px.className = "pixel";
      if (value) px.style.backgroundColor = mosaic.color;
      el.appendChild(px);
    });
  });
  return el;
}

function buildUnsolvedPanel(mosaic, pr, pc, handlers) {
  const el = document.createElement("button");
  el.className = "panel-tile unsolved";
  el.style.gridColumn = `${pc * mosaic.panelSize + 1} / span ${mosaic.panelSize}`;
  el.style.gridRow = `${pr * mosaic.panelSize + 1} / span ${mosaic.panelSize}`;
  el.title = `Solve panel ${pr + 1}, ${pc + 1}`;
  el.addEventListener("click", () => handlers.onOpenPanel(pr, pc));
  return el;
}

function renderMosaicCanvas(session, handlers) {
  const el = document.getElementById("mosaic-canvas");
  const { mosaic } = session;
  el.style.setProperty("--total-cols", mosaic.cols);
  el.style.setProperty("--total-rows", mosaic.rows);
  el.innerHTML = "";
  for (let pr = 0; pr < mosaic.panelRows; pr++) {
    for (let pc = 0; pc < mosaic.panelCols; pc++) {
      el.appendChild(
        session.isPanelSolved(pr, pc)
          ? buildSolvedPanel(mosaic, pr, pc)
          : buildUnsolvedPanel(mosaic, pr, pc, handlers)
      );
    }
  }
}

export function renderOverview(session, handlers) {
  document.getElementById("mosaic-title").textContent = session.mosaic.title;
  document.getElementById("progress-badge").textContent =
    `${session.solvedCount} / ${session.totalPanels} panels`;
  updateTimerDisplays(session);
  renderMosaicCanvas(session, handlers);
}

export function updateTimerDisplays(session) {
  const text = String(Math.min(session.elapsedSeconds(), 9999)).padStart(3, "0");
  document.querySelectorAll(".session-timer").forEach((el) => {
    el.textContent = text;
  });
}

export function showMosaicCompleteModal(session) {
  const time = session.elapsedSeconds();
  document.getElementById("mosaic-complete-detail").textContent =
    `You finished "${session.mosaic.title}" - all ${session.totalPanels} panels - in ${time}s.`;
  document.getElementById("mosaic-complete-modal").classList.remove("hidden");
}

// ---------- Panel solving screen (one small ordinary picross puzzle) ----------

function renderColClues(panelGame) {
  const el = document.getElementById("col-clues");
  el.style.setProperty("--cols", panelGame.size);
  el.innerHTML = "";
  for (let c = 0; c < panelGame.size; c++) {
    const cell = document.createElement("div");
    cell.className = "col-clue-cell" + (panelGame.colSolved(c) ? " solved" : "");
    panelGame.targetColClues[c].forEach((clue) => {
      const chip = document.createElement("div");
      chip.className = "clue-num";
      chip.textContent = String(clue.count);
      cell.appendChild(chip);
    });
    el.appendChild(cell);
  }
}

function renderRowClues(panelGame) {
  const el = document.getElementById("row-clues");
  el.innerHTML = "";
  for (let r = 0; r < panelGame.size; r++) {
    const cell = document.createElement("div");
    cell.className = "row-clue-cell" + (panelGame.rowSolved(r) ? " solved" : "");
    panelGame.targetRowClues[r].forEach((clue) => {
      const chip = document.createElement("div");
      chip.className = "clue-num";
      chip.textContent = String(clue.count);
      cell.appendChild(chip);
    });
    el.appendChild(cell);
  }
}

function buildCellEl(panelGame, color, r, c, handlers) {
  const el = document.createElement("div");
  const value = panelGame.playerGrid[r][c];
  el.className = "cell" + (value ? " filled" : " empty");
  if (value) {
    el.style.backgroundColor = color;
  } else if (panelGame.marks[r][c]) {
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

function renderBoard(panelGame, color, handlers) {
  const boardEl = document.getElementById("board");
  boardEl.style.setProperty("--cols", panelGame.size);
  boardEl.innerHTML = "";
  panelGame.playerGrid.forEach((row, r) => {
    row.forEach((_, c) => boardEl.appendChild(buildCellEl(panelGame, color, r, c, handlers)));
  });
}

export function renderPanel(session, handlers) {
  const panelGame = session.currentPanelGame();
  const { pr, pc } = session.view;
  document.getElementById("panel-label").textContent =
    `Panel ${pr + 1},${pc + 1} · ${panelGame.size}×${panelGame.size}`;
  document.getElementById("mark-mode-btn").classList.toggle("active", panelGame.markMode);
  updateTimerDisplays(session);
  renderColClues(panelGame);
  renderRowClues(panelGame);
  renderBoard(panelGame, session.mosaic.color, handlers);
}
