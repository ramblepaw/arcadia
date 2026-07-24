import { getPuzzle } from "./puzzles.js";
import { lineClues, rowClues, colClues, cluesEqual } from "./clues.js";

function createGrid(rows, cols, fill) {
  return Array.from({ length: rows }, () => new Array(cols).fill(fill));
}

export class Game {
  constructor(slug) {
    this.puzzle = getPuzzle(slug);
    this.listeners = [];
    this.playerGrid = createGrid(this.puzzle.rows, this.puzzle.cols, 0);
    this.marks = createGrid(this.puzzle.rows, this.puzzle.cols, false);
    this.targetRowClues = rowClues(this.puzzle.grid);
    this.targetColClues = colClues(this.puzzle.grid);
    this.selectedColor = 1;
    this.markMode = false;
    this.phase = "playing"; // "playing" -> "solved"
    this.startTime = null;
    this.endTime = null;
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  get isSolved() {
    return this.phase === "solved";
  }

  elapsedSeconds() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return Math.floor((end - this.startTime) / 1000);
  }

  setSelectedColor(colorIndex) {
    this.selectedColor = colorIndex;
    this.emit();
  }

  toggleMarkMode() {
    this.markMode = !this.markMode;
    this.emit();
  }

  paintCell(r, c) {
    if (this.phase !== "playing") return;
    if (!this.startTime) this.startTime = Date.now();

    if (this.markMode) {
      this.toggleMark(r, c);
      return;
    }

    this.marks[r][c] = false;
    const cell = this.playerGrid[r][c];
    this.playerGrid[r][c] = cell === this.selectedColor ? 0 : this.selectedColor;
    this.checkWin();
    if (this.phase === "playing") this.emit();
  }

  toggleMark(r, c) {
    if (this.phase !== "playing") return;
    if (!this.startTime) this.startTime = Date.now();
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
      row.every((cell, c) => cell === this.puzzle.grid[r][c])
    );
    if (solved) {
      this.phase = "solved";
      this.endTime = Date.now();
      this.emit();
    }
  }
}
