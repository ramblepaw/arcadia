// Card model and deck construction for Bullshit (aka BS / Cheat / I Doubt It).
//
// Standard 52-card deck, ranks 2..14 where 11=J, 12=Q, 13=K, 14=A. Unlike
// Palace, no rank has special play powers here - the only thing that matters
// is RANK_SEQUENCE, the fixed order claims must cycle through (see rules.js).

export const SUITS = ["hearts", "diamonds", "clubs", "spades"];
export const MIN_RANK = 2;
export const MAX_RANK = 14;

const SUIT_ICON = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

const RANK_LABEL = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export function rankLabel(rank) {
  return RANK_LABEL[rank] || String(rank);
}

export function rankLabelPlural(rank) {
  return `${rankLabel(rank)}s`;
}

export function suitIcon(suit) {
  return SUIT_ICON[suit] || "?";
}

let __cardIdCounter = 0;

function makeCard(suit, rank) {
  __cardIdCounter += 1;
  return { id: `s${__cardIdCounter}`, suit, rank };
}

/** Builds the full 52-card deck, unshuffled. */
export function createDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (let rank = MIN_RANK; rank <= MAX_RANK; rank++) {
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
