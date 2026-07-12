// Pure legality logic for FreeCell, kept separate from game.js's state
// mutation. Nothing in this file reads or writes game state - every
// function takes plain data (cards, columns, counts) and returns a plain
// answer.
//
// Tableau columns are arrays of cards ordered bottom -> top, i.e.
// column[0] is buried deepest and column[column.length - 1] is the
// visible, playable card.

export function isRed(suit) {
  return suit === "hearts" || suit === "diamonds";
}

export function isBlack(suit) {
  return suit === "clubs" || suit === "spades";
}

export function isOppositeColor(suitA, suitB) {
  return isRed(suitA) !== isRed(suitB);
}

/** True if `upper` may legally sit directly on top of `lower` in a tableau column. */
export function canStack(upper, lower) {
  return isOppositeColor(upper.suit, lower.suit) && upper.rank === lower.rank - 1;
}

/**
 * Length of the maximal alternating-color, descending-rank run sitting at
 * the top of `column`. A non-empty column always has a run of at least 1
 * (the top card alone always counts).
 */
export function topRunLength(column) {
  if (column.length === 0) return 0;
  let len = 1;
  for (let i = column.length - 1; i > 0; i--) {
    const upper = column[i];
    const lower = column[i - 1];
    if (canStack(upper, lower)) {
      len++;
    } else {
      break;
    }
  }
  return len;
}

/**
 * Returns the run of cards from `index` through the top of `column` if
 * that span forms a valid alternating-descending run, else null. The top
 * card by itself is always a valid run of 1.
 */
export function getRunFromIndex(column, index) {
  if (index < 0 || index >= column.length) return null;
  const runLen = topRunLength(column);
  const runStart = column.length - runLen;
  if (index < runStart) return null;
  return column.slice(index);
}

/**
 * The classic FreeCell "supermove" capacity formula: the maximum number of
 * cards that can be moved together as one group, given how many free cells
 * and empty tableau columns are currently available to stage the move.
 *
 * If the destination itself is an empty column, that column cannot be used
 * as one of its own staging columns, so it is excluded from the count.
 */
export function maxSupermove(freeCellsAvailable, emptyColumns, movingToEmptyColumn) {
  const usableEmptyColumns = movingToEmptyColumn ? Math.max(0, emptyColumns - 1) : emptyColumns;
  return (1 + freeCellsAvailable) * Math.pow(2, usableEmptyColumns);
}

/** The next rank a foundation for `suit` needs (1 = Ace if the foundation is empty). */
export function nextFoundationRank(foundations, suit) {
  return (foundations[suit] || 0) + 1;
}

export function canPlaceOnFoundation(foundations, card) {
  return card.rank === nextFoundationRank(foundations, card.suit);
}

/** Whether `run` (bottom card first) may be dropped onto the top of `column`. */
export function canPlaceOnTableau(column, run) {
  if (run.length === 0) return false;
  if (column.length === 0) return true;
  const top = column[column.length - 1];
  const bottom = run[0];
  return canStack(bottom, top);
}
