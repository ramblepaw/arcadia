import { rankLabel, suitIcon } from "./deck.js";
import { TOTAL_CARDS, TOTAL_SEQUENCES } from "./game.js";

function cardInnerHTML(card) {
  const label = rankLabel(card.rank);
  const icon = suitIcon(card.suit);
  return `<div class="rank-top">${label}</div><div class="suit-icon">${icon}</div><div class="rank-bottom">${label}</div>`;
}

function buildCardEl(card, { faceDown = false, selected = false, onClick = null } = {}) {
  const el = document.createElement("div");
  const classes = ["card"];
  if (faceDown) {
    classes.push("face-down");
  } else {
    classes.push(`suit-${card.suit}`);
  }
  if (selected) classes.push("selected");
  el.className = classes.join(" ");
  if (!faceDown) el.innerHTML = cardInnerHTML(card);
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

function renderHud(game) {
  const statusEl = document.getElementById("status-info");
  if (game.isGameOver) {
    statusEl.textContent = game.outcome === "win" ? "All sequences complete!" : "No more progress is possible.";
  } else if (game.selected) {
    statusEl.textContent = "Click a destination column to move, or click the card again to cancel.";
  } else {
    statusEl.textContent = "Click a card to select it, or deal from the stock.";
  }
  document.getElementById("sequences-badge").textContent = `${game.sequencesCompleted}/${TOTAL_SEQUENCES} sequences`;
  document.getElementById("score-badge").textContent = `Score: ${game.score}`;
  document.getElementById("undo-btn").disabled = !game.canUndo;
  document.getElementById("player-status").textContent = game.message || "";
}

function renderTableau(game, handlers) {
  const wrap = document.getElementById("tableau");
  wrap.innerHTML = "";
  game.tableau.forEach((column, c) => {
    const colEl = document.createElement("div");
    colEl.className = "tableau-column";

    if (column.length === 0) {
      colEl.classList.add("empty");
      colEl.addEventListener("click", () => handlers.onEmptyColumnClick(c));
      wrap.appendChild(colEl);
      return;
    }

    column.forEach((cell, i) => {
      const selected = game.isSelected(c, i);
      const el = buildCardEl(cell.card, {
        faceDown: !cell.faceUp,
        selected,
        onClick: (e) => {
          e.stopPropagation();
          handlers.onCardClick(c, i);
        },
      });
      colEl.appendChild(el);
    });
    wrap.appendChild(colEl);
  });
}

function renderStock(game, handlers) {
  const stockEl = document.getElementById("stock-pile");
  stockEl.innerHTML = "";
  const canDeal = game.canDeal();
  if (game.stockCount() > 0 && !game.isGameOver) {
    stockEl.classList.toggle("empty", false);
    stockEl.classList.toggle("disabled", !canDeal);
    const back = buildCardEl(null, {
      faceDown: true,
      onClick: canDeal ? () => handlers.onDeal() : null,
    });
    stockEl.appendChild(back);
    const badge = document.createElement("div");
    badge.className = "pile-count-badge";
    badge.textContent = game.dealsLeft();
    stockEl.appendChild(badge);
  } else {
    stockEl.classList.add("empty");
    stockEl.classList.remove("disabled");
  }
}

function renderFoundation(game) {
  const wrap = document.getElementById("foundation");
  wrap.innerHTML = "";
  for (let i = 0; i < TOTAL_SEQUENCES; i++) {
    const slot = document.createElement("div");
    slot.className = "foundation-slot";
    if (i < game.sequencesCompleted) slot.classList.add("filled");
    wrap.appendChild(slot);
  }
}

export function renderAll(game, handlers) {
  renderHud(game);
  renderTableau(game, handlers);
  renderStock(game, handlers);
  renderFoundation(game);
}

export function showGameOverModal(game) {
  const win = game.outcome === "win";
  const cleared = TOTAL_CARDS - game.remaining();
  document.getElementById("game-over-title").textContent = win ? "You Win!" : "No More Progress Possible";
  document.getElementById("game-over-detail").textContent = win
    ? `All 8 King-to-Ace sequences completed (${cleared} cards cleared) in ${game.moves} moves, scoring ${game.score} points.`
    : `No sequence of moves can complete another run. ${game.sequencesCompleted}/8 sequences completed (${cleared} cards cleared), scoring ${game.score} points.`;
  document.getElementById("game-over-modal").classList.remove("hidden");
}
