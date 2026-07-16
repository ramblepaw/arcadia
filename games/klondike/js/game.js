import { createDeck, shuffle, SUITS } from "./deck.js";
import {
  canPlaceOnColumn,
  canPlaceOnFoundation,
  getMovableSequence,
  hasWon,
  countOffFoundation,
} from "./rules.js";
import { canMakeProgress } from "./solver.js";

export const NUM_COLUMNS = 7;
export const TOTAL_CARDS = 52;

export class Game {
  constructor(drawCount = 1) {
    this.listeners = [];
    this.drawCount = drawCount === 3 ? 3 : 1;
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
    this.tableau = [];
    for (let col = 0; col < NUM_COLUMNS; col++) {
      const pile = [];
      for (let n = 0; n <= col; n++) {
        const card = deck[idx++];
        card.faceUp = n === col; // only the last dealt card starts face up
        pile.push(card);
      }
      this.tableau.push(pile);
    }
    this.stock = deck.slice(idx);
    this.waste = [];
    this.foundations = {};
    for (const suit of SUITS) this.foundations[suit] = [];

    this.selection = null; // { type: "waste" } | { type: "tableau", col, index }
    this.moves = 0;
    this.redeals = 0;
    this.score = 0;
    this.history = [];
    this.phase = "playing"; // "playing" -> "gameOver"
    this.outcome = null; // "win" (this game never reports a loss state)
    this.message = "Draw from the stock, or move a card to get started.";
    this.emit();
  }

  get canUndo() {
    return this.phase === "playing" && this.history.length > 0;
  }

  /** Snapshot the mutable state before a move, for undo(). */
  pushHistory() {
    this.history.push(
      structuredClone({
        tableau: this.tableau,
        stock: this.stock,
        waste: this.waste,
        foundations: this.foundations,
        selection: this.selection,
        moves: this.moves,
        redeals: this.redeals,
        score: this.score,
        phase: this.phase,
        outcome: this.outcome,
        message: this.message,
      })
    );
  }

  undo() {
    if (!this.canUndo) return false;
    Object.assign(this, this.history.pop());
    this.emit();
    return true;
  }

  get isGameOver() {
    return this.phase === "gameOver";
  }

  // ---------- read helpers ----------

  topOfWaste() {
    return this.waste.length ? this.waste[this.waste.length - 1] : null;
  }

  topOfFoundation(suit) {
    const pile = this.foundations[suit];
    return pile.length ? pile[pile.length - 1] : null;
  }

  remaining() {
    return countOffFoundation(this.tableau, this.stock, this.waste);
  }

  foundationCount() {
    return TOTAL_CARDS - this.remaining();
  }

  isSelected(loc) {
    if (!this.selection) return false;
    if (loc.type !== this.selection.type) return false;
    if (loc.type === "waste") return true;
    return loc.col === this.selection.col && loc.index === this.selection.index;
  }

  /** The sequence of cards (1 or more) that the current selection represents, or null. */
  selectedSequence() {
    if (!this.selection) return null;
    if (this.selection.type === "waste") {
      const top = this.topOfWaste();
      return top ? [top] : null;
    }
    const { col, index } = this.selection;
    return getMovableSequence(this.tableau[col], index);
  }

  canDropOnTableau(destCol) {
    const seq = this.selectedSequence();
    if (!seq) return false;
    if (this.selection.type === "tableau" && this.selection.col === destCol) return false;
    return canPlaceOnColumn(this.tableau[destCol], seq[0]);
  }

  canDropOnFoundation(suit) {
    const seq = this.selectedSequence();
    if (!seq || seq.length !== 1) return false;
    return canPlaceOnFoundation(this.foundations[suit], seq[0]);
  }

  // ---------- selection ----------

  selectWaste() {
    if (this.phase !== "playing" || this.waste.length === 0) return;
    if (this.selection && this.selection.type === "waste") {
      this.selection = null;
    } else {
      this.selection = { type: "waste" };
    }
    this.message = "";
    this.emit();
  }

  selectTableau(col, index) {
    if (this.phase !== "playing") return;
    const pile = this.tableau[col];
    const card = pile[index];
    if (!card) return;

    // Clicking the current selection again deselects it.
    if (this.isSelected({ type: "tableau", col, index })) {
      this.selection = null;
      this.message = "";
      this.emit();
      return;
    }

    // If a selection exists and this column is a legal destination, drop here.
    if (this.selection && index === pile.length - 1 && this.canDropOnTableau(col)) {
      this.moveSelectionToTableau(col);
      return;
    }

    if (!card.faceUp) return; // face-down, not selectable and not a valid drop target

    this.selection = { type: "tableau", col, index };
    this.message = "";
    this.emit();
  }

  clickEmptyColumn(col) {
    if (this.phase !== "playing") return;
    if (this.selection && this.canDropOnTableau(col)) {
      this.moveSelectionToTableau(col);
      return;
    }
  }

  clickFoundation(suit) {
    if (this.phase !== "playing") return;
    if (this.selection && this.canDropOnFoundation(suit)) {
      this.moveSelectionToFoundation(suit);
    }
  }

  // ---------- moves ----------

  moveSelectionToTableau(destCol) {
    if (!this.selection || !this.canDropOnTableau(destCol)) return false;
    this.pushHistory();
    if (this.selection.type === "waste") {
      const card = this.waste.pop();
      this.tableau[destCol].push(card);
      this.score += 5; // waste -> tableau
    } else {
      const { col, index } = this.selection;
      const src = this.tableau[col];
      const seq = src.splice(index);
      this.tableau[destCol].push(...seq);
      if (this.flipNewTop(col)) this.score += 5;
    }
    this.selection = null;
    this.moves++;
    this.message = "";
    this.checkOutcome();
    if (this.phase === "playing") this.emit();
    return true;
  }

  moveSelectionToFoundation(suit) {
    if (!this.selection || !this.canDropOnFoundation(suit)) return false;
    this.pushHistory();
    if (this.selection.type === "waste") {
      const card = this.waste.pop();
      this.foundations[suit].push(card);
    } else {
      const { col } = this.selection;
      const src = this.tableau[col];
      const card = src.pop();
      this.foundations[suit].push(card);
      if (this.flipNewTop(col)) this.score += 5;
    }
    this.score += 10; // card reached a foundation
    this.selection = null;
    this.moves++;
    this.message = "";
    this.checkOutcome();
    if (this.phase === "playing") this.emit();
    return true;
  }

  /** Double-click helper: send the top card of waste straight to its foundation, if legal. */
  autoMoveWasteToFoundation() {
    if (this.phase !== "playing") return false;
    const card = this.topOfWaste();
    if (!card || !canPlaceOnFoundation(this.foundations[card.suit], card)) return false;
    this.pushHistory();
    this.waste.pop();
    this.foundations[card.suit].push(card);
    this.score += 10;
    this.selection = null;
    this.moves++;
    this.message = "";
    this.checkOutcome();
    if (this.phase === "playing") this.emit();
    return true;
  }

  /** Double-click helper: send the top card of a tableau column straight to its foundation. */
  autoMoveTableauToFoundation(col) {
    if (this.phase !== "playing") return false;
    const pile = this.tableau[col];
    const card = pile[pile.length - 1];
    if (!card || !card.faceUp) return false;
    if (!canPlaceOnFoundation(this.foundations[card.suit], card)) return false;
    this.pushHistory();
    pile.pop();
    this.foundations[card.suit].push(card);
    this.score += 10;
    if (this.flipNewTop(col)) this.score += 5;
    this.selection = null;
    this.moves++;
    this.message = "";
    this.checkOutcome();
    if (this.phase === "playing") this.emit();
    return true;
  }

  /** Flip the new top card of a tableau column face up, if it was just exposed. Returns whether it flipped. */
  flipNewTop(col) {
    const pile = this.tableau[col];
    if (pile.length === 0) return false;
    const top = pile[pile.length - 1];
    if (top.faceUp) return false;
    top.faceUp = true;
    return true;
  }

  draw() {
    if (this.phase !== "playing") return false;
    if (this.stock.length === 0 && this.waste.length === 0) return false;
    this.pushHistory();
    if (this.stock.length > 0) {
      const n = Math.min(this.drawCount, this.stock.length);
      for (let i = 0; i < n; i++) {
        const card = this.stock.pop();
        card.faceUp = true;
        this.waste.push(card);
      }
    } else {
      // Recycle waste back into stock, preserving draw order.
      while (this.waste.length) {
        const card = this.waste.pop();
        card.faceUp = false;
        this.stock.push(card);
      }
      this.redeals++;
    }
    this.selection = null;
    this.moves++;
    this.message = "";
    this.checkOutcome();
    if (this.phase === "playing") this.emit();
    return true;
  }

  checkOutcome() {
    if (hasWon(this.foundations)) {
      this.phase = "gameOver";
      this.outcome = "win";
      this.message = "All four foundations complete - you win!";
      this.emit();
    } else if (!canMakeProgress(this.tableau, this.stock, this.waste, this.foundations, this.drawCount)) {
      this.phase = "gameOver";
      this.outcome = "loss";
      this.message = "No more progress is possible - game over.";
      this.emit();
    }
  }
}
