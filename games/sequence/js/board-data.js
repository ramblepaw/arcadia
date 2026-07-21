// Card/board geometry for Sequence. The board is a 10x10 grid (cell id =
// row*10+col). The 4 corners are free spaces, wild for every player. The
// other 96 cells each show one of the 48 non-jack cards, every card printed
// twice - we shuffle a fresh layout each game rather than hardcode the
// printed board's exact arrangement.

export const SUITS = ["S", "H", "D", "C"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Q", "K"];
export const BOARD_SIZE = 10;

export const TWO_EYED_JACK_SUITS = ["D", "C"]; // wild - place anywhere
export const ONE_EYED_JACK_SUITS = ["H", "S"]; // remove an opponent chip

export const SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_RED = { S: false, H: true, D: true, C: false };

export const HAND_SIZE_BY_PLAYERS = { 2: 7, 3: 6 };

export const CORNER_IDS = [0, 9, 90, 99];

export const LINE_DIRECTIONS = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal down-right
  [1, -1], // diagonal down-left
];

export function cellIdOf(row, col) {
  return row * BOARD_SIZE + col;
}

export function rowColOf(id) {
  return { row: Math.floor(id / BOARD_SIZE), col: id % BOARD_SIZE };
}

export function isCornerId(id) {
  return CORNER_IDS.includes(id);
}

export function cardKey(card) {
  return `${card.rank}${card.suit}`;
}

export function isTwoEyedJack(card) {
  return card.rank === "J" && TWO_EYED_JACK_SUITS.includes(card.suit);
}

export function isOneEyedJack(card) {
  return card.rank === "J" && ONE_EYED_JACK_SUITS.includes(card.suit);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let nextCardId = 1;

function makeCard(rank, suit) {
  return { id: `c${nextCardId++}`, rank, suit };
}

// Two full 52-card decks (including jacks) - the pile players draw from.
export function buildDrawDeck() {
  const cards = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push(makeCard(rank, suit));
      cards.push(makeCard("J", suit));
    }
  }
  return shuffle(cards);
}

// 96 non-jack cards (2 copies each of the 48 unique ones) laid onto the
// board's non-corner cells.
export function buildBoard() {
  const boardCards = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) boardCards.push({ rank, suit });
    }
  }
  const shuffled = shuffle(boardCards);

  const cells = [];
  let cursor = 0;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const id = cellIdOf(row, col);
      const corner = isCornerId(id);
      cells.push({
        id, row, col,
        isCorner: corner,
        card: corner ? null : shuffled[cursor++],
        chip: null,
        locked: false,
      });
    }
  }
  return cells;
}
