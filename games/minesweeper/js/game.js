import {
  DIFFICULTIES,
  createEmptyBoard,
  placeMines,
  revealCell,
  revealAllMines,
  countFlaggedNeighbors,
  neighborsOf,
  countRevealed,
} from "./board.js";

export { DIFFICULTIES };

export class Game {
  constructor(difficultyKey) {
    this.difficultyKey = difficultyKey;
    this.config = DIFFICULTIES[difficultyKey];
    this.listeners = [];
    this.cells = createEmptyBoard(this.config.rows, this.config.cols);
    this.minesPlaced = false;
    this.phase = "playing"; // "playing" -> "gameOver"
    this.outcome = null; // "win" | "loss"
    this.flagsPlaced = 0;
    this.startTime = null;
    this.endTime = null;
    this.explodedCell = null;
    this.message = "Reveal a cell to start.";
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  get isGameOver() {
    return this.phase === "gameOver";
  }

  get totalCells() {
    return this.config.rows * this.config.cols;
  }

  get safeCells() {
    return this.totalCells - this.config.mines;
  }

  get minesRemaining() {
    return this.config.mines - this.flagsPlaced;
  }

  elapsedSeconds() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return Math.floor((end - this.startTime) / 1000);
  }

  reveal(r, c) {
    if (this.phase !== "playing") return;
    const cell = this.cells[r][c];
    if (cell.revealed || cell.flagged) return;

    if (!this.minesPlaced) {
      placeMines(this.cells, this.config.mines, r, c);
      this.minesPlaced = true;
      this.startTime = Date.now();
      this.message = "";
    }

    if (cell.mine) {
      cell.revealed = true;
      this.loseGame(r, c);
      return;
    }

    revealCell(this.cells, r, c);
    this.checkWin();
    if (this.phase === "playing") this.emit();
  }

  toggleFlag(r, c) {
    if (this.phase !== "playing") return;
    const cell = this.cells[r][c];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    this.flagsPlaced += cell.flagged ? 1 : -1;
    this.emit();
  }

  chord(r, c) {
    if (this.phase !== "playing") return;
    const cell = this.cells[r][c];
    if (!cell.revealed || cell.adjacent === 0) return;
    if (countFlaggedNeighbors(this.cells, r, c) !== cell.adjacent) return;

    let hitMine = null;
    for (const [nr, nc] of neighborsOf(this.cells, r, c)) {
      const ncell = this.cells[nr][nc];
      if (ncell.revealed || ncell.flagged) continue;
      if (ncell.mine) {
        ncell.revealed = true;
        hitMine = [nr, nc];
      } else {
        revealCell(this.cells, nr, nc);
      }
    }

    if (hitMine) {
      this.loseGame(hitMine[0], hitMine[1]);
      return;
    }
    this.checkWin();
    if (this.phase === "playing") this.emit();
  }

  loseGame(r, c) {
    this.phase = "gameOver";
    this.outcome = "loss";
    this.endTime = Date.now();
    this.explodedCell = [r, c];
    revealAllMines(this.cells);
    this.message = "Boom! You hit a mine.";
    this.emit();
  }

  checkWin() {
    if (countRevealed(this.cells) === this.safeCells) {
      this.phase = "gameOver";
      this.outcome = "win";
      this.endTime = Date.now();
      this.message = "Field cleared!";
      this.emit();
    }
  }
}
