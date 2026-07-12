// Pile legality and special-card effects for Palace.
//
// The pile has a "requirement" that determines what can legally be played on
// top of it next:
//   - open:          anything goes (start of pile, or right after a 2/Joker/burn)
//   - sevenOrUnder:  only rank <=7 (or a 2/10/Joker, which are always legal)
//   - rank:minRank:  rank must be >= minRank
//
// 2, 10, and Joker are always legal regardless of the current requirement -
// a 2 resets the pile to open, a 10 burns it outright, and a Joker resets
// the pile to open and reverses play direction (see game.js).

import { isSpecial, JOKER_RANK } from "./deck.js";

export function canPlayCard(card, requirement) {
  if (isSpecial(card)) return true;
  if (requirement.type === "open") return true;
  if (requirement.type === "sevenOrUnder") return card.rank <= 7;
  return card.rank >= requirement.minRank;
}

/** Any card in `cards` legal to play under `requirement`? */
export function hasLegalPlay(cards, requirement) {
  return cards.some((c) => canPlayCard(c, requirement));
}

/** Distinct ranks in `cards` that are currently legal to play. */
export function legalRanks(cards, requirement) {
  const ranks = new Set();
  for (const c of cards) {
    if (canPlayCard(c, requirement)) ranks.add(c.rank);
  }
  return [...ranks];
}

/** How many cards at the top of the pile (played array, bottom..top) share the top rank. */
export function topRunLength(pile) {
  if (pile.length === 0) return 0;
  const topRank = pile[pile.length - 1].rank;
  let count = 0;
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i].rank !== topRank) break;
    count++;
  }
  return count;
}

/** The requirement that applies after `playedCards` (all same rank) land on top of the pile. */
export function nextRequirement(playedRank) {
  if (playedRank === 2 || playedRank === JOKER_RANK) return { type: "open" };
  if (playedRank === 7) return { type: "sevenOrUnder" };
  return { type: "rank", minRank: playedRank };
}

/** Does playing this rank on top of the (already-updated) pile trigger a burn? */
export function burnsFromPlay(pile, playedRank) {
  if (playedRank === 10) return true;
  return topRunLength(pile) >= 4;
}
