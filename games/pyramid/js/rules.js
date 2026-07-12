// Pure legality logic for Pyramid, kept separate from game.js's state
// mutation. The pyramid is a 7-row triangle (1..7 cards per row, apex
// first). A cell is "exposed" once both cells directly below it (in the
// next row) have been removed - the bottom row starts exposed since it has
// no row beneath it. See jellyneo/neopets.com/games/pyramids for the
// reference rules this reproduces.

import { MAX_RANK } from "./deck.js";

export const PYRAMID_ROWS = 7;

/** Aces are both low and high, so King-Ace-2 is a valid adjacent run. */
export function isAdjacent(rankA, rankB) {
  const diff = Math.abs(rankA - rankB);
  return diff === 1 || diff === MAX_RANK - 1;
}

export function isExposed(pyramid, r, c) {
  const cell = pyramid[r][c];
  if (cell.removed) return false;
  if (r === pyramid.length - 1) return true;
  return pyramid[r + 1][c].removed && pyramid[r + 1][c + 1].removed;
}

export function canPlayCell(pyramid, r, c, guideCard) {
  if (!guideCard || !isExposed(pyramid, r, c)) return false;
  return isAdjacent(pyramid[r][c].card.rank, guideCard.rank);
}

export function hasAnyMove(pyramid, guideCard) {
  for (let r = 0; r < pyramid.length; r++) {
    for (let c = 0; c < pyramid[r].length; c++) {
      if (canPlayCell(pyramid, r, c, guideCard)) return true;
    }
  }
  return false;
}

export function remainingCount(pyramid) {
  let n = 0;
  for (const row of pyramid) {
    for (const cell of row) {
      if (!cell.removed) n++;
    }
  }
  return n;
}
