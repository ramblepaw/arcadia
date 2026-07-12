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

/**
 * True if any sequence of moves could still change the board. Since redeals
 * are unlimited and preserve order, every card still in the stock or waste
 * will eventually reach the top of the waste pile if nothing else changes -
 * so it's enough to check whether ANY of them (regardless of current
 * position) would be legal on some foundation or tableau column right now.
 * If nothing here or in the tableau can move, the position is truly stuck.
 */
export function hasAnyMove(tableau, stock, waste, foundations) {
  // Tableau -> tableau (a face-up card, or the valid run above it, landing
  // on a different column).
  for (let from = 0; from < tableau.length; from++) {
    const col = tableau[from];
    for (let i = 0; i < col.length; i++) {
      if (!col[i].faceUp) continue;
      const seq = getMovableSequence(col, i);
      if (!seq) continue;
      for (let to = 0; to < tableau.length; to++) {
        if (to === from) continue;
        if (canPlaceOnColumn(tableau[to], seq[0])) return true;
      }
    }
  }

  // Tableau top -> foundation.
  for (const col of tableau) {
    if (col.length === 0) continue;
    const top = col[col.length - 1];
    if (top.faceUp && canPlaceOnFoundation(foundations[top.suit], top)) return true;
  }

  // Any card still off the foundations, wherever it sits in stock/waste.
  for (const card of [...stock, ...waste]) {
    if (canPlaceOnFoundation(foundations[card.suit], card)) return true;
    for (const col of tableau) {
      if (canPlaceOnColumn(col, card)) return true;
    }
  }

  return false;
}
