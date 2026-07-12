// Card model and deck construction for Spider.
//
// Spider is played with two standard 52-card decks combined (104 cards, no
// Jokers), ranks 1..13 where 1=Ace, 11=J, 12=Q, 13=K. Which suits actually
// appear depends on the suit-count variant chosen at the start screen - see
// createDeck below. Regardless of variant there are always 8 copies of each
// rank in the combined deck.

export const SUITS = ["hearts", "diamonds", "clubs", "spades"];
export const MIN_RANK = 1;
export const MAX_RANK = 13;

const SUIT_ICON = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

const RANK_LABEL = {
  1: "A",
  11: "J",
  12: "Q",
  13: "K",
};

export function rankLabel(rank) {
  return RANK_LABEL[rank] || String(rank);
}

export function suitIcon(suit) {
  return SUIT_ICON[suit] || "?";
}

let __cardIdCounter = 0;

function makeCard(suit, rank) {
  __cardIdCounter += 1;
  return { id: `s${__cardIdCounter}`, suit, rank };
}

/**
 * Builds the 8 suit-assignments (one per copy of a given rank) used for the
 * chosen suit-count variant:
 *   1 suit  - all 8 copies are spades (visually a single-suit game).
 *   2 suits - 4 copies spades, 4 copies hearts.
 *   4 suits - 2 copies of each of the 4 suits (the true two-deck mix).
 */
function suitAssignment(suitCount) {
  if (suitCount === 1) return Array(8).fill("spades");
  if (suitCount === 2) return [...Array(4).fill("spades"), ...Array(4).fill("hearts")];
  if (suitCount === 4) {
    const arr = [];
    for (const suit of SUITS) {
      arr.push(suit, suit);
    }
    return arr;
  }
  throw new Error(`Unsupported suit count: ${suitCount}`);
}

/** Builds the full 104-card combined deck, unshuffled. */
export function createDeck(suitCount = 1) {
  const suits = suitAssignment(suitCount);
  const cards = [];
  for (let rank = MIN_RANK; rank <= MAX_RANK; rank++) {
    for (const suit of suits) {
      cards.push(makeCard(suit, rank));
    }
  }
  return cards;
}

/** Fisher-Yates shuffle, returns a new shuffled array. */
export function shuffle(cards) {
  const arr = cards.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cardLabel(card) {
  return `${rankLabel(card.rank)} of ${card.suit}`;
}
