import { lineClues, rowClues, colClues, cluesEqual } from "./clues.js";

function createGrid(size, fill) {
  return Array.from({ length: size }, () => new Array(size).fill(fill));
}

// One panel's worth of ordinary (monochrome) picross: fill cells to match
// `target`, using only the clues derived from `target` itself.
export class PanelGame {
  constructor(target, callbacks = {}) {
    this.target = target;
    this.size = target.length;
    this.callbacks = callbacks;
    this.listeners = [];
    this.playerGrid = createGrid(this.size, 0);
    this.marks = createGrid(this.size, false);
    this.targetRowClues = rowClues(this.target);
    this.targetColClues = colClues(this.target);
    this.markMode = false;
    this.solved = false;
    this.startTime = null;
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  toggleMarkMode() {
    this.markMode = !this.markMode;
    this.emit();
  }

  markStart() {
    if (!this.startTime) {
      this.startTime = Date.now();
      this.callbacks.onFirstInteraction?.();
    }
  }

  paintCell(r, c) {
    if (this.solved) return;
    this.markStart();
    if (this.markMode) {
      this.toggleMark(r, c);
      return;
    }
    this.marks[r][c] = false;
    this.playerGrid[r][c] = this.playerGrid[r][c] ? 0 : 1;
    this.checkWin();
    if (!this.solved) this.emit();
  }

  toggleMark(r, c) {
    if (this.solved) return;
    this.markStart();
    if (this.playerGrid[r][c] !== 0) return; // only mark cells known to be empty
    this.marks[r][c] = !this.marks[r][c];
    this.emit();
  }

  rowSolved(r) {
    return cluesEqual(lineClues(this.playerGrid[r]), this.targetRowClues[r]);
  }

  colSolved(c) {
    const column = this.playerGrid.map((row) => row[c]);
    return cluesEqual(lineClues(column), this.targetColClues[c]);
  }

  checkWin() {
    const solved = this.playerGrid.every((row, r) =>
      row.every((cell, c) => cell === this.target[r][c])
    );
    if (solved) {
      this.solved = true;
      this.callbacks.onSolved?.();
      this.emit();
    }
  }
}
