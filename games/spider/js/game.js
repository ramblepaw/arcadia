import { createDeck, shuffle } from "./deck.js";
import {
  TABLEAU_COLUMNS,
  TOTAL_SEQUENCES,
  getMovableRun,
  canDropOn,
  hasEmptyColumn,
  checkAndClearSequence,
  remainingCount,
} from "./rules.js";

export const TOTAL_CARDS = 104;
export { TOTAL_SEQUENCES };

// First 4 columns get 6 cards, remaining 6 columns get 5 (4*6 + 6*5 = 54).
const DEAL_COUNTS = Array.from({ length: TABLEAU_COLUMNS }, (_, c) => (c < 4 ? 6 : 5));

export class Game {
  constructor(suitCount = 1) {
    this.listeners = [];
    this.suitCount = suitCount;
    this.deal();
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  deal() {
    const deck = shuffle(createDeck(this.suitCount));
    let idx = 0;
    this.tableau = DEAL_COUNTS.map((count) => {
      const column = [];
      for (let i = 0; i < count; i++) {
        column.push({ card: deck[idx++], faceUp: i === count - 1 });
      }
      return column;
    });
    this.stock = deck.slice(idx); // 50 cards, dealt 10 at a time

    this.selected = null; // { col, index } | null
    this.moves = 0;
    this.sequencesCompleted = 0;
    this.score = 0;
    this.history = [];
    this.phase = "playing"; // "playing" -> "gameOver"
    this.outcome = null; // "win" | null (Spider has no forced-loss state)
    this.message = "Build King-to-Ace runs of the same suit to clear them.";
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
        selected: this.selected,
        moves: this.moves,
        sequencesCompleted: this.sequencesCompleted,
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

  remaining() {
    return remainingCount(this.tableau, this.stock);
  }

  stockCount() {
    return this.stock.length;
  }

  dealsLeft() {
    return Math.floor(this.stock.length / TABLEAU_COLUMNS);
  }

  canDeal() {
    return this.phase === "playing" && this.stock.length > 0 && !hasEmptyColumn(this.tableau);
  }

  isSelected(col, index) {
    if (!this.selected || this.selected.col !== col) return false;
    return index >= this.selected.index;
  }

  dealFromStock() {
    if (!this.canDeal()) return false;
    this.pushHistory();
    for (let c = 0; c < TABLEAU_COLUMNS; c++) {
      const card = this.stock.pop();
      this.tableau[c].push({ card, faceUp: true });
    }
    this.selected = null;
    this.moves++;
    this.message = "";
    this.afterMove();
    return true;
  }

  /** Handles a click on a face-up tableau card. */
  selectCard(col, index) {
    if (this.phase !== "playing") return;
    const column = this.tableau[col];
    const cell = column[index];
    if (!cell || !cell.faceUp) return;

    if (this.selected && this.selected.col === col && this.selected.index === index) {
      // clicking the selected card again deselects it
      this.selected = null;
      this.emit();
      return;
    }

    if (this.selected && this.selected.col !== col) {
      // a selection is active and the player clicked into a different
      // column - treat that column as the move destination
      this.attemptMove(col);
      return;
    }

    // nothing selected yet, or clicking a different card within the same
    // column that has the current selection - try to start a new selection
    const run = getMovableRun(column, index);
    if (run) {
      this.selected = { col, index };
      this.emit();
    }
    // else: not a valid run start - do nothing, per spec
  }

  /** Handles a click on an empty tableau column (used as a drop target). */
  selectEmptyColumn(col) {
    if (this.phase !== "playing") return;
    if (!this.selected) return;
    if (this.selected.col === col) return;
    this.attemptMove(col);
  }

  attemptMove(toCol) {
    const { col: fromCol, index } = this.selected;
    const fromColumn = this.tableau[fromCol];
    const run = getMovableRun(fromColumn, index);
    if (!run) {
      this.selected = null;
      this.emit();
      return false;
    }

    const toColumn = this.tableau[toCol];
    if (!canDropOn(toColumn, fromColumn, index)) {
      // invalid destination - leave the selection as-is and do nothing
      return false;
    }

    this.pushHistory();
    const moving = fromColumn.splice(index);
    toColumn.push(...moving);

    if (fromColumn.length > 0) {
      const newTop = fromColumn[fromColumn.length - 1];
      if (!newTop.faceUp) {
        newTop.faceUp = true;
        this.score += 5;
      }
    }

    this.selected = null;
    this.moves++;
    this.message = "";
    this.afterMove();
    return true;
  }

  afterMove() {
    for (const column of this.tableau) {
      const cleared = checkAndClearSequence(column);
      if (cleared) {
        this.sequencesCompleted++;
        this.score += 100;
        if (column.length > 0) {
          const newTop = column[column.length - 1];
          if (!newTop.faceUp) {
            newTop.faceUp = true;
            this.score += 5;
          }
        }
      }
    }

    if (this.sequencesCompleted >= TOTAL_SEQUENCES) {
      this.phase = "gameOver";
      this.outcome = "win";
      this.message = "All eight sequences complete - you win!";
    }

    this.emit();
  }
}
