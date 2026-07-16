import { createDeck, shuffle, SUITS } from "./deck.js";
import { getRunFromIndex, canPlaceOnTableau, canPlaceOnFoundation, maxSupermove } from "./rules.js";
import { canMakeProgress } from "./solver.js";

export const TOTAL_CARDS = 52;
export const COLUMN_COUNTS = [7, 7, 7, 7, 6, 6, 6, 6];
export const FREE_CELL_COUNT = 4;

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
    this.tableau = COLUMN_COUNTS.map((count) => {
      const col = deck.slice(idx, idx + count);
      idx += count;
      return col;
    });
    this.freeCells = new Array(FREE_CELL_COUNT).fill(null);
    this.foundations = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
    this.selection = null; // { type: "tableau", col, startIndex } | { type: "freecell", cell }
    this.moves = 0;
    this.points = 0;
    this.history = [];
    this.phase = "playing"; // "playing" -> "gameOver"
    this.outcome = null; // "win" | null (FreeCell has no forced-loss state)
    this.message = "Click a card to select it, then click where it should go.";
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
        freeCells: this.freeCells,
        foundations: this.foundations,
        selection: this.selection,
        moves: this.moves,
        points: this.points,
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

  cardsOnFoundations() {
    return SUITS.reduce((sum, suit) => sum + this.foundations[suit], 0);
  }

  /** Cards NOT yet on a foundation - lower is better, used as the reported score. */
  score() {
    return TOTAL_CARDS - this.cardsOnFoundations();
  }

  freeCellsAvailableCount() {
    return this.freeCells.filter((c) => c === null).length;
  }

  emptyColumnsCount() {
    return this.tableau.filter((col) => col.length === 0).length;
  }

  getSelectedRun() {
    if (!this.selection) return null;
    if (this.selection.type === "tableau") {
      return this.tableau[this.selection.col].slice(this.selection.startIndex);
    }
    if (this.selection.type === "freecell") {
      const card = this.freeCells[this.selection.cell];
      return card ? [card] : null;
    }
    return null;
  }

  isTableauCardSelected(col, index) {
    return (
      !!this.selection &&
      this.selection.type === "tableau" &&
      this.selection.col === col &&
      index >= this.selection.startIndex
    );
  }

  isFreeCellSelected(cell) {
    return !!this.selection && this.selection.type === "freecell" && this.selection.cell === cell;
  }

  /** Which cards in `column` are the start of a currently-selectable run. */
  isSelectableRunStart(column, index) {
    return getRunFromIndex(column, index) !== null;
  }

  removeSelectedRunFromSource() {
    if (this.selection.type === "tableau") {
      this.tableau[this.selection.col].splice(this.selection.startIndex);
    } else if (this.selection.type === "freecell") {
      this.freeCells[this.selection.cell] = null;
    }
  }

  onTableauCardClick(colIndex, cardIndex) {
    if (this.phase !== "playing") return;
    const column = this.tableau[colIndex];

    if (this.selection) {
      if (
        this.selection.type === "tableau" &&
        this.selection.col === colIndex &&
        this.selection.startIndex === cardIndex
      ) {
        // Clicking the selected run's start card again deselects it.
        this.selection = null;
        this.message = "";
        this.emit();
        return;
      }
      if (this.selection.type === "tableau" && this.selection.col === colIndex) {
        // Clicked elsewhere within the source column - not a valid destination.
        return;
      }
      this.attemptMoveToTableau(colIndex);
      return;
    }

    const run = getRunFromIndex(column, cardIndex);
    if (!run) return; // not the start of a valid run - no-op
    this.selection = { type: "tableau", col: colIndex, startIndex: cardIndex };
    this.message = "";
    this.emit();
  }

  onEmptyColumnClick(colIndex) {
    if (this.phase !== "playing" || !this.selection) return;
    this.attemptMoveToTableau(colIndex);
  }

  attemptMoveToTableau(destCol) {
    const run = this.getSelectedRun();
    if (!run || run.length === 0) return;
    const destColumn = this.tableau[destCol];
    const destEmpty = destColumn.length === 0;

    if (!canPlaceOnTableau(destColumn, run)) return; // illegal destination - no-op

    const freeAvail = this.freeCellsAvailableCount();
    const emptyCols = this.emptyColumnsCount();
    const capacity = maxSupermove(freeAvail, emptyCols, destEmpty);

    if (run.length > capacity) {
      this.message = `Not enough free cells/columns to move ${run.length} cards.`;
      this.emit();
      return;
    }

    this.pushHistory();
    this.removeSelectedRunFromSource();
    destColumn.push(...run);
    this.moves++;
    this.selection = null;
    this.message = "";
    this.checkOutcome();
    if (this.phase === "playing") this.emit();
  }

  onFreeCellClick(cellIndex) {
    if (this.phase !== "playing") return;
    const card = this.freeCells[cellIndex];

    if (this.selection) {
      if (this.selection.type === "freecell" && this.selection.cell === cellIndex) {
        this.selection = null;
        this.message = "";
        this.emit();
        return;
      }
      if (card === null) {
        this.attemptMoveToFreeCell(cellIndex);
      }
      return;
    }

    if (card !== null) {
      this.selection = { type: "freecell", cell: cellIndex };
      this.message = "";
      this.emit();
    }
  }

  attemptMoveToFreeCell(cellIndex) {
    const run = this.getSelectedRun();
    if (!run || run.length !== 1) return; // only single cards fit in a free cell
    this.pushHistory();
    this.removeSelectedRunFromSource();
    this.freeCells[cellIndex] = run[0];
    this.moves++;
    this.selection = null;
    this.message = "";
    this.checkOutcome();
    if (this.phase === "playing") this.emit();
  }

  onFoundationClick(suit) {
    if (this.phase !== "playing" || !this.selection) return;
    const run = this.getSelectedRun();
    if (!run || run.length !== 1) return;
    const card = run[0];
    if (card.suit !== suit || !canPlaceOnFoundation(this.foundations, card)) return;

    this.pushHistory();
    this.removeSelectedRunFromSource();
    this.foundations[suit] = card.rank;
    this.points += 10;
    this.moves++;
    this.selection = null;
    this.message = "";
    this.checkOutcome();
    if (this.phase === "playing") this.emit();
  }

  checkOutcome() {
    if (this.cardsOnFoundations() === TOTAL_CARDS) {
      this.phase = "gameOver";
      this.outcome = "win";
      this.message = "All four foundations complete - you win!";
      this.emit();
    } else if (!canMakeProgress(this.tableau, this.freeCells, this.foundations)) {
      this.phase = "gameOver";
      this.outcome = "loss";
      this.message = "No more progress is possible - game over.";
      this.emit();
    }
  }
}
