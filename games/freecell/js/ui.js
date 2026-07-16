import { rankLabel, suitIcon, SUITS } from "./deck.js";
import { TOTAL_CARDS } from "./game.js";

function cardInnerHTML(card) {
  const label = rankLabel(card.rank);
  const icon = suitIcon(card.suit);
  return `<div class="rank-top">${label}</div><div class="suit-icon">${icon}</div><div class="rank-bottom">${label}</div>`;
}

function buildCardEl(card, { selected = false, onClick = null } = {}) {
  const el = document.createElement("div");
  const classes = ["card", `suit-${card.suit}`];
  if (selected) classes.push("selected");
  el.className = classes.join(" ");
  el.innerHTML = cardInnerHTML(card);
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

function renderHud(game) {
  const statusEl = document.getElementById("status-info");
  if (game.isGameOver) {
    statusEl.textContent = game.outcome === "win" ? "All foundations complete!" : "No more progress is possible.";
  } else {
    statusEl.textContent = "Select a card or run, then click its destination.";
  }
  document.getElementById("remaining-badge").textContent = `${game.score()} left`;
  document.getElementById("moves-badge").textContent = `${game.moves} moves`;
  document.getElementById("score-badge").textContent = `Score: ${game.points}`;
  document.getElementById("undo-btn").disabled = !game.canUndo;
  document.getElementById("player-status").textContent = game.message || "";
}

function renderFreeCells(game, handlers) {
  const wrap = document.getElementById("free-cells");
  wrap.innerHTML = "";
  game.freeCells.forEach((card, i) => {
    const slot = document.createElement("div");
    slot.className = "cell-slot";
    if (card) {
      const selected = game.isFreeCellSelected(i);
      slot.appendChild(buildCardEl(card, { selected, onClick: () => handlers.onFreeCellClick(i) }));
    } else {
      slot.classList.add("empty");
      slot.addEventListener("click", () => handlers.onFreeCellClick(i));
    }
    wrap.appendChild(slot);
  });
}

function renderFoundations(game, handlers) {
  const wrap = document.getElementById("foundations");
  wrap.innerHTML = "";
  SUITS.forEach((suit) => {
    const slot = document.createElement("div");
    slot.className = `cell-slot foundation-slot suit-${suit}`;
    const rank = game.foundations[suit];
    if (rank > 0) {
      slot.appendChild(buildCardEl({ suit, rank }, { onClick: () => handlers.onFoundationClick(suit) }));
    } else {
      slot.classList.add("empty");
      slot.innerHTML = `<div class="foundation-watermark">${suitIcon(suit)}</div>`;
      slot.addEventListener("click", () => handlers.onFoundationClick(suit));
    }
    wrap.appendChild(slot);
  });
}

function renderTableau(game, handlers) {
  const wrap = document.getElementById("tableau");
  wrap.innerHTML = "";
  game.tableau.forEach((column, colIndex) => {
    const colEl = document.createElement("div");
    colEl.className = "tableau-column";
    if (column.length === 0) {
      const empty = document.createElement("div");
      empty.className = "card slot-empty";
      empty.addEventListener("click", () => handlers.onEmptyColumnClick(colIndex));
      colEl.appendChild(empty);
    } else {
      column.forEach((card, cardIndex) => {
        const selected = game.isTableauCardSelected(colIndex, cardIndex);
        const el = buildCardEl(card, {
          selected,
          onClick: () => handlers.onTableauCardClick(colIndex, cardIndex),
        });
        el.style.zIndex = String(cardIndex + 1);
        colEl.appendChild(el);
      });
    }
    wrap.appendChild(colEl);
  });
}

export function renderAll(game, handlers) {
  renderHud(game);
  renderFreeCells(game, handlers);
  renderFoundations(game, handlers);
  renderTableau(game, handlers);
}

export function showGameOverModal(game) {
  const win = game.outcome === "win";
  document.getElementById("game-over-title").textContent = win ? "You Win!" : "No More Progress Possible";
  document.getElementById("game-over-detail").textContent = win
    ? `All ${TOTAL_CARDS} cards made it to the foundations in ${game.moves} moves, scoring ${game.points} points.`
    : `No sequence of moves can reach another foundation. ${game.cardsOnFoundations()} of ${TOTAL_CARDS} cards made it, scoring ${game.points} points.`;
  document.getElementById("game-over-modal").classList.remove("hidden");
}
