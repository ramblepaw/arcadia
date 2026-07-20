import { BOARD_SIZE, LINE_DIRECTIONS, isTwoEyedJack, isOneEyedJack, rowColOf, cellIdOf } from "./board-data.js";

export function boardCellsForCard(board, card) {
  return board
    .filter((cell) => !cell.isCorner && cell.card.rank === card.rank && cell.card.suit === card.suit)
    .map((cell) => cell.id);
}

export function emptyCellsForCard(board, card) {
  return boardCellsForCard(board, card).filter((id) => board[id].chip === null);
}

export function emptyNonCornerCells(board) {
  return board.filter((cell) => !cell.isCorner && cell.chip === null).map((cell) => cell.id);
}

export function removableCells(board, playerId) {
  return board
    .filter((cell) => !cell.isCorner && cell.chip !== null && cell.chip !== playerId && !cell.locked)
    .map((cell) => cell.id);
}

// A card is "dead" once it has no legal target left: both printed board
// spaces occupied for a normal card, no open space for a two-eyed jack, or
// no removable opponent chip for a one-eyed jack (common at the start of a
// game, before any chips are on the board).
export function cardTargets(board, card, playerId) {
  if (isTwoEyedJack(card)) {
    const cells = emptyNonCornerCells(board);
    return cells.length === 0 ? { kind: "dead", cells: [] } : { kind: "place", cells };
  }
  if (isOneEyedJack(card)) {
    const cells = removableCells(board, playerId);
    return cells.length === 0 ? { kind: "dead", cells: [] } : { kind: "remove", cells };
  }
  const cells = emptyCellsForCard(board, card);
  return cells.length === 0 ? { kind: "dead", cells: [] } : { kind: "place", cells };
}

export function isCardDead(board, card, playerId) {
  return cardTargets(board, card, playerId).kind === "dead";
}

// All valid 5-cell windows (in any of the 4 line directions) that pass through cellId.
export function windowsThrough(cellId) {
  const { row, col } = rowColOf(cellId);
  const windows = [];
  for (const [dr, dc] of LINE_DIRECTIONS) {
    for (let start = -4; start <= 0; start++) {
      const cells = [];
      let ok = true;
      for (let k = 0; k < 5; k++) {
        const r = row + (start + k) * dr;
        const c = col + (start + k) * dc;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) { ok = false; break; }
        cells.push(cellIdOf(r, c));
      }
      if (ok && cells.includes(cellId)) windows.push(cells);
    }
  }
  return windows;
}

function overlapsExisting(candidate, sequences) {
  return sequences.some((seq) => candidate.filter((id) => seq.includes(id)).length >= 2);
}

// Finds newly-completed sequences through the just-placed cell. Returns an
// array of 5-cell arrays. A candidate window only counts if it isn't already
// mostly covered by a sequence this player has already banked (chips may be
// shared by at most one cell between two sequences).
export function findNewSequences(board, playerId, cellId, existingSequences) {
  const found = [];
  for (const cells of windowsThrough(cellId)) {
    const valid = cells.every((id) => board[id].isCorner || board[id].chip === playerId);
    if (!valid) continue;
    if (overlapsExisting(cells, existingSequences) || overlapsExisting(cells, found)) continue;
    found.push(cells);
  }
  return found;
}
