// Card model and deck construction for Five Crowns.
//
// Ranks run 3..13 where 11=Jack, 12=Queen, 13=King (no Aces or 2s).
// Suits: stars, hearts, clubs, diamonds, spades.
// Two full decks are combined, plus 6 jokers (3 per deck), for 116 cards.

export const SUITS = ["stars", "hearts", "clubs", "diamonds", "spades"];
export const MIN_RANK = 3;
export const MAX_RANK = 13;
export const JOKERS_PER_DECK = 3;
export const NUM_SUB_DECKS = 2;

const SUIT_ICON = {
  stars: "★",
  hearts: "♥",
  clubs: "♣",
  diamonds: "♦",
  spades: "♠",
};

const RANK_LABEL = {
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

function makeCard(suit, rank, isJoker) {
  __cardIdCounter += 1;
  return {
    id: `c${__cardIdCounter}`,
    suit: isJoker ? null : suit,
    rank: isJoker ? null : rank,
    isJoker: !!isJoker,
  };
}

/** Builds the full 116-card Five Crowns deck (unshuffled). */
export function createDeck() {
  const cards = [];
  for (let d = 0; d < NUM_SUB_DECKS; d++) {
    for (const suit of SUITS) {
      for (let rank = MIN_RANK; rank <= MAX_RANK; rank++) {
        cards.push(makeCard(suit, rank, false));
      }
    }
    for (let j = 0; j < JOKERS_PER_DECK; j++) {
      cards.push(makeCard(null, null, true));
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

/** True if this card counts as wild this round (joker, or matches the round's wild rank). */
export function isWildCard(card, wildRank) {
  return card.isJoker || card.rank === wildRank;
}

/** Point value of a card when left unmatched (deadwood). */
export function cardValue(card, wildRank) {
  if (card.isJoker) return 50;
  if (card.rank === wildRank) return 20;
  return card.rank; // number cards face value; J=11, Q=12, K=13
}

export function cardLabel(card) {
  if (card.isJoker) return "Joker";
  return `${rankLabel(card.rank)} of ${card.suit}`;
}
