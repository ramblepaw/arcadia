// Card model and deck construction for Palace (aka Shithead / Karma).
//
// Standard 52-card deck, ranks 2..14 where 11=J, 12=Q, 13=K, 14=A, plus 2
// Jokers. Three ranks are "special" and sit outside the normal low-to-high
// ordering: 2 (always playable, resets the pile to open), 10 (always
// playable, burns the pile), and Joker (always playable, reverses play
// direction and resets the pile to open). See rules.js/game.js for how
// those interact with play legality and turn order.

export const SUITS = ["hearts", "diamonds", "clubs", "spades"];
export const MIN_RANK = 2;
export const MAX_RANK = 14;
export const JOKER_COUNT = 2;
export const JOKER_RANK = "JOKER";

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
  if (rank === JOKER_RANK) return "JK";
  return RANK_LABEL[rank] || String(rank);
}

export function suitIcon(suit) {
  return SUIT_ICON[suit] || "?";
}

let __cardIdCounter = 0;

function makeCard(suit, rank, isJoker = false) {
  __cardIdCounter += 1;
  return { id: `s${__cardIdCounter}`, suit: isJoker ? null : suit, rank: isJoker ? JOKER_RANK : rank, isJoker };
}

/** Builds the full 54-card deck (52 + 2 Jokers), unshuffled. */
export function createDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (let rank = MIN_RANK; rank <= MAX_RANK; rank++) {
      cards.push(makeCard(suit, rank));
    }
  }
  for (let i = 0; i < JOKER_COUNT; i++) {
    cards.push(makeCard(null, null, true));
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

export function isTwo(card) {
  return card.rank === 2;
}

export function isTen(card) {
  return card.rank === 10;
}

export function isSpecial(card) {
  return isTwo(card) || isTen(card) || card.isJoker;
}

export function cardLabel(card) {
  if (card.isJoker) return "Joker";
  return `${rankLabel(card.rank)} of ${card.suit}`;
}
