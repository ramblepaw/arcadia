export const DIFFICULTIES = {
  beginner: { label: "Beginner", rows: 9, cols: 9, mines: 10 },
  intermediate: { label: "Intermediate", rows: 16, cols: 16, mines: 40 },
  expert: { label: "Expert", rows: 16, cols: 30, mines: 99 },
};

export function createEmptyBoard(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({ mine: false, revealed: false, flagged: false, adjacent: 0 });
    }
    cells.push(row);
  }
  return cells;
}

function forEachNeighbor(cells, r, c, fn) {
  const rows = cells.length;
  const cols = cells[0].length;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        fn(cells[nr][nc], nr, nc);
      }
    }
  }
}

// Mines are placed after the first click so that click can never be a mine,
// and its immediate neighbors are kept clear too so the opening move usually
// reveals a decent-sized patch instead of a single lonely cell.
export function placeMines(cells, mineCount, safeR, safeC) {
  const rows = cells.length;
  const cols = cells[0].length;
  const safe = new Set([`${safeR},${safeC}`]);
  forEachNeighbor(cells, safeR, safeC, (_cell, nr, nc) => safe.add(`${nr},${nc}`));

  const candidates = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!safe.has(`${r},${c}`)) candidates.push([r, c]);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  candidates.slice(0, mineCount).forEach(([r, c]) => {
    cells[r][c].mine = true;
  });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c].mine) continue;
      let count = 0;
      forEachNeighbor(cells, r, c, (cell) => {
        if (cell.mine) count++;
      });
      cells[r][c].adjacent = count;
    }
  }
}

// Flood-fills outward from (r, c) through connected zero-adjacency cells,
// revealing them and the numbered cells bordering the flood.
export function revealCell(cells, r, c) {
  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    const cell = cells[cr][cc];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.adjacent === 0 && !cell.mine) {
      forEachNeighbor(cells, cr, cc, (ncell, nr, nc) => {
        if (!ncell.revealed && !ncell.flagged) stack.push([nr, nc]);
      });
    }
  }
}

export function countFlaggedNeighbors(cells, r, c) {
  let count = 0;
  forEachNeighbor(cells, r, c, (cell) => {
    if (cell.flagged) count++;
  });
  return count;
}

export function neighborsOf(cells, r, c) {
  const list = [];
  forEachNeighbor(cells, r, c, (_cell, nr, nc) => list.push([nr, nc]));
  return list;
}

export function revealAllMines(cells) {
  for (const row of cells) {
    for (const cell of row) {
      if (cell.mine) cell.revealed = true;
    }
  }
}

export function countRevealed(cells) {
  let n = 0;
  for (const row of cells) {
    for (const cell of row) {
      if (cell.revealed) n++;
    }
  }
  return n;
}
