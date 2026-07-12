import { createDeck, shuffle } from "./deck.js";
import { PYRAMID_ROWS, isExposed, canPlayCell, hasAnyMove, remainingCount } from "./rules.js";

export const TOTAL_PYRAMID_CARDS = (PYRAMID_ROWS * (PYRAMID_ROWS + 1)) / 2;

export class Game {
  constructor() {
    this.listeners = [];
    this.deal();
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  deal() {
    const deck = shuffle(createDeck());
    let idx = 0;
    this.pyramid = [];
    for (let r = 0; r < PYRAMID_ROWS; r++) {
      const row = [];
      for (let c = 0; c <= r; c++) {
        row.push({ card: deck[idx++], removed: false });
      }
      this.pyramid.push(row);
    }
    this.stock = deck.slice(idx);
    this.guideCard = this.stock.pop();
    this.moves = 0;
    this.phase = "playing"; // "playing" -> "gameOver"
    this.outcome = null; // "win" | "loss"
    this.message = "Play a pyramid card one rank above or below the guide card.";
    this.emit();
  }

  get isGameOver() {
    return this.phase === "gameOver";
  }

  isExposed(r, c) {
    return isExposed(this.pyramid, r, c);
  }

  canPlayCell(r, c) {
    return this.phase === "playing" && canPlayCell(this.pyramid, r, c, this.guideCard);
  }

  remaining() {
    return remainingCount(this.pyramid);
  }

  stockCount() {
    return this.stock.length;
  }

  playCell(r, c) {
    if (!this.canPlayCell(r, c)) return false;
    const cell = this.pyramid[r][c];
    cell.removed = true;
    this.guideCard = cell.card;
    this.moves++;
    this.message = "";
    this.checkOutcome();
    if (this.phase === "playing") this.emit();
    return true;
  }

  draw() {
    if (this.phase !== "playing" || this.stock.length === 0) return false;
    this.guideCard = this.stock.pop();
    this.moves++;
    this.message = "";
    this.checkOutcome();
    if (this.phase === "playing") this.emit();
    return true;
  }

  checkOutcome() {
    if (this.remaining() === 0) {
      this.phase = "gameOver";
      this.outcome = "win";
      this.message = "Pyramid cleared - you win!";
      this.emit();
      return;
    }
    if (this.stock.length === 0 && !hasAnyMove(this.pyramid, this.guideCard)) {
      this.phase = "gameOver";
      this.outcome = "loss";
      this.message = "Out of stock cards with no moves left.";
      this.emit();
    }
  }
}
