import { getMosaic } from "./mosaics.js";
import { PanelGame } from "./panel-game.js";

// Coordinates one mosaic play-through: which panel (if any) is currently
// open, a lazily-created PanelGame per panel (so partial progress survives
// navigating back to the overview), and the mosaic-wide clock/solve count.
export class MosaicSession {
  constructor(slug) {
    this.mosaic = getMosaic(slug);
    this.listeners = [];
    this.panelGames = Array.from({ length: this.mosaic.panelRows }, () =>
      new Array(this.mosaic.panelCols).fill(null)
    );
    this.solvedCount = 0;
    this.startTime = null;
    this.endTime = null;
    this.view = "overview"; // "overview" | { pr, pc }
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  get totalPanels() {
    return this.mosaic.panelRows * this.mosaic.panelCols;
  }

  get isComplete() {
    return this.solvedCount === this.totalPanels;
  }

  elapsedSeconds() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return Math.floor((end - this.startTime) / 1000);
  }

  isPanelSolved(pr, pc) {
    const g = this.panelGames[pr][pc];
    return !!g && g.solved;
  }

  openPanel(pr, pc) {
    if (!this.panelGames[pr][pc]) {
      const game = new PanelGame(this.mosaic.panels[pr][pc], {
        onFirstInteraction: () => {
          if (!this.startTime) this.startTime = Date.now();
        },
        onSolved: () => {
          this.solvedCount++;
          if (this.isComplete) this.endTime = Date.now();
        },
      });
      game.subscribe(() => this.emit());
      this.panelGames[pr][pc] = game;
    }
    this.view = { pr, pc };
    this.emit();
  }

  showOverview() {
    this.view = "overview";
    this.emit();
  }

  currentPanelGame() {
    if (this.view === "overview") return null;
    return this.panelGames[this.view.pr][this.view.pc];
  }
}
