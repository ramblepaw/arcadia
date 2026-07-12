// Pure legality logic for Spider, kept separate from game.js's state
// mutation.
//
// A tableau column is stored as an array of cells `{ card, faceUp }` in the
// order they were placed: index 0 is the first card dealt into the column
// (buried deepest), and the last index is the most recently placed card -
// the only one normally accessible for picking up a run, and the one a new
// card must legally stack onto (exactly one rank lower, any suit).
//
// A "run" is a contiguous span from some index through the end of the
// column. It is always movable as a single unit if it's exactly one card
// (the top card). A run of 2+ cards is only movable together if it is a
// same-suit sequence: each card closer to the top of the column is exactly
// one rank lower than, and the same suit as, the card before it.

export const TABLEAU_COLUMNS = 10;
export const SEQUENCE_LENGTH = 13;
export const TOTAL_SEQUENCES = 8;

/** True if `column` has no cards. */
export function isColumnEmpty(column) {
  return column.length === 0;
}

/** True if any tableau column is currently empty. */
export function hasEmptyColumn(tableau) {
  return tableau.some((column) => column.length === 0);
}

/**
 * Returns the list of indices (index..top) that form the movable run
 * starting at `index`, or null if that card can't start a move (face-down,
 * out of range, or - for an interior card - the span up to the top of the
 * column isn't a valid same-suit descending sequence).
 */
export function getMovableRun(column, index) {
  if (index < 0 || index >= column.length) return null;
  if (!column[index].faceUp) return null;

  const topIndex = column.length - 1;
  if (index === topIndex) return [topIndex];

  for (let i = index; i < topIndex; i++) {
    const a = column[i];
    const b = column[i + 1];
    if (!a.faceUp || !b.faceUp) return null;
    if (b.card.suit !== a.card.suit || b.card.rank !== a.card.rank - 1) return null;
  }

  const indices = [];
  for (let i = index; i <= topIndex; i++) indices.push(i);
  return indices;
}

/**
 * True if the run starting at `fromColumn[runStartIndex]` (through the top
 * of that column) may legally land on `toColumn`: an empty column accepts
 * any run, otherwise the destination's exposed top card must be exactly one
 * rank higher than the run's anchor card (the card that was clicked, which
 * touches the destination pile), regardless of the destination card's suit.
 */
export function canDropOn(toColumn, fromColumn, runStartIndex) {
  const movingCard = fromColumn[runStartIndex].card;
  if (toColumn.length === 0) return true;
  const top = toColumn[toColumn.length - 1];
  if (!top.faceUp) return false;
  return top.card.rank === movingCard.rank + 1;
}

/**
 * If the top SEQUENCE_LENGTH cards of `column` form a complete, face-up,
 * same-suit King-to-Ace run, removes them in place and returns true.
 * Otherwise leaves `column` untouched and returns false.
 */
export function checkAndClearSequence(column) {
  if (column.length < SEQUENCE_LENGTH) return false;
  const start = column.length - SEQUENCE_LENGTH;
  const span = column.slice(start);

  if (!span.every((cell) => cell.faceUp)) return false;

  const suit = span[0].card.suit;
  for (let i = 0; i < SEQUENCE_LENGTH; i++) {
    const expectedRank = SEQUENCE_LENGTH - i; // K(13) down to A(1)
    if (span[i].card.rank !== expectedRank) return false;
    if (span[i].card.suit !== suit) return false;
  }

  column.splice(start, SEQUENCE_LENGTH);
  return true;
}

/** Total cards still in play (tableau + stock), i.e. not yet cleared. */
export function remainingCount(tableau, stock) {
  const inTableau = tableau.reduce((n, column) => n + column.length, 0);
  return inTableau + stock.length;
}

/**
 * True if any tableau shuffle is currently legal, or another deal from the
 * stock is available. If neither holds, no move can ever change the board -
 * Spider's stock is single-pass (no redeals), so this is a real deadlock.
 */
export function hasAnyMove(tableau, canDeal) {
  for (let from = 0; from < tableau.length; from++) {
    const column = tableau[from];
    for (let i = 0; i < column.length; i++) {
      const run = getMovableRun(column, i);
      if (!run) continue;
      for (let to = 0; to < tableau.length; to++) {
        if (to === from) continue;
        if (canDropOn(tableau[to], column, i)) return true;
      }
    }
  }
  return canDeal;
}
