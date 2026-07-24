// Derives standard nonogram clues (runs of consecutive same-color cells,
// ignoring blanks) from a grid. Used both to render the row/column clue
// panels and to detect when a given line currently satisfies its clue.

export function lineClues(line) {
  const clues = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === 0) {
      i++;
      continue;
    }
    const color = line[i];
    let j = i;
    while (j < line.length && line[j] === color) j++;
    clues.push({ count: j - i, color });
    i = j;
  }
  return clues;
}

export function rowClues(grid) {
  return grid.map((row) => lineClues(row));
}

export function colClues(grid) {
  const cols = grid[0].length;
  const result = [];
  for (let c = 0; c < cols; c++) {
    result.push(lineClues(grid.map((row) => row[c])));
  }
  return result;
}

export function cluesEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((clue, i) => clue.count === b[i].count && clue.color === b[i].color);
}
