// Pure legality logic for Klondike, kept separate from game.js's state
// mutation. Nothing in this file mutates its arguments.

import { MAX_RANK, MIN_RANK, isRed } from "./deck.js";

/** Can `upper` be placed directly on top of `lower` in a tableau column? */
export function canStackTableau(lower, upper) {
  if (!lower || !upper) return false;
  return lower.rank === upper.rank + 1 && isRed(lower) !== isRed(upper);
}

/** Can `card` (a single card, not a run) be dropped onto this tableau column? */
export function canPlaceOnColumn(column, card) {
  if (!card) return false;
  if (column.length === 0) return card.rank === MAX_RANK;
  const top = column[column.length - 1];
  return top.faceUp && canStackTableau(top, card);
}

/** Can `card` be placed on this foundation pile (array, top = last)? */
export function canPlaceOnFoundation(foundationPile, card) {
  if (!card) return false;
  if (foundationPile.length === 0) return card.rank === MIN_RANK;
  const top = foundationPile[foundationPile.length - 1];
  return top.suit === card.suit && card.rank === top.rank + 1;
}

/**
 * Is `cards` (an ordered array, first = topmost-in-stack / lowest rank goes
 * last) a valid alternating-color descending run, all face up? A single
 * card is trivially valid.
 */
export function isValidSequence(cards) {
  if (cards.length === 0) return false;
  for (const c of cards) {
    if (!c.faceUp) return false;
  }
  for (let i = 1; i < cards.length; i++) {
    if (!canStackTableau(cards[i - 1], cards[i])) return false;
  }
  return true;
}

/**
 * If the cards in `column` from `index` to the end form a movable
 * (valid, all face-up) sequence, return that slice; otherwise null.
 */
export function getMovableSequence(column, index) {
  if (index < 0 || index >= column.length) return null;
  const seq = column.slice(index);
  return isValidSequence(seq) ? seq : null;
}

/** True once every foundation pile holds all 13 cards of its suit. */
export function hasWon(foundations) {
  return Object.values(foundations).every((pile) => pile.length === MAX_RANK);
}

/** Total number of cards not yet resting on a foundation. */
export function countOffFoundation(tableau, stock, waste) {
  let n = stock.length + waste.length;
  for (const col of tableau) n += col.length;
  return n;
}
