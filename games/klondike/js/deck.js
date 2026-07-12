// Card model and deck construction for Klondike.
//
// Standard 52-card deck, no Jokers, ranks 1..13 where 1=Ace, 11=J, 12=Q,
// 13=K. Cards also carry a `faceUp` flag since Klondike (unlike Pyramid)
// needs cards to flip state in place as columns are uncovered.

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

const RED_SUITS = new Set(["hearts", "diamonds"]);

export function rankLabel(rank) {
  return RANK_LABEL[rank] || String(rank);
}

export function suitIcon(suit) {
  return SUIT_ICON[suit] || "?";
}

export function isRed(suitOrCard) {
  const suit = typeof suitOrCard === "string" ? suitOrCard : suitOrCard.suit;
  return RED_SUITS.has(suit);
}

export function isBlack(suitOrCard) {
  return !isRed(suitOrCard);
}

let __cardIdCounter = 0;

function makeCard(suit, rank) {
  __cardIdCounter += 1;
  return { id: `k${__cardIdCounter}`, suit, rank, faceUp: false };
}

/** Builds the full 52-card deck, unshuffled, all face-down. */
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
