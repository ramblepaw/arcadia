import { rankLabel, suitIcon } from "./deck.js";
import { TOTAL_PYRAMID_CARDS } from "./game.js";

function cardInnerHTML(card) {
  const label = rankLabel(card.rank);
  const icon = suitIcon(card.suit);
  return `<div class="rank-top">${label}</div><div class="suit-icon">${icon}</div><div class="rank-bottom">${label}</div>`;
}

function buildCardEl(card, { covered = false, legal = false, disabled = false, onClick = null } = {}) {
  const el = document.createElement("div");
  const classes = ["card"];
  if (covered) {
    classes.push("face-down");
  } else {
    classes.push(`suit-${card.suit}`);
  }
  if (legal) classes.push("legal");
  if (disabled) classes.push("disabled");
  el.className = classes.join(" ");
  if (!covered) el.innerHTML = cardInnerHTML(card);
  if (onClick && !disabled) el.addEventListener("click", onClick);
  return el;
}

function renderHud(game) {
  const statusEl = document.getElementById("status-info");
  if (game.isGameOver) {
    statusEl.textContent = game.outcome === "win" ? "Pyramid cleared!" : "No moves left.";
  } else {
    statusEl.textContent = "Click a glowing pyramid card, or draw a new guide card.";
  }
  document.getElementById("remaining-badge").textContent = `${game.remaining()} left`;
  document.getElementById("player-status").textContent = game.message || "";
}

function renderPyramid(game, handlers) {
  const wrap = document.getElementById("pyramid");
  wrap.innerHTML = "";
  game.pyramid.forEach((row, r) => {
    const rowEl = document.createElement("div");
    rowEl.className = "pyramid-row";
    row.forEach((cell, c) => {
      if (cell.removed) {
        const spacer = document.createElement("div");
        spacer.className = "card slot-empty";
        rowEl.appendChild(spacer);
        return;
      }
      const exposed = game.isExposed(r, c);
      const legal = exposed && game.canPlayCell(r, c);
      const el = buildCardEl(cell.card, {
        covered: !exposed,
        legal,
        disabled: !legal,
        onClick: legal ? () => handlers.onPlayCell(r, c) : null,
      });
      rowEl.appendChild(el);
    });
    wrap.appendChild(rowEl);
  });
}

function renderTray(game, handlers) {
  const stockEl = document.getElementById("stock-pile");
  stockEl.innerHTML = "";
  if (game.stockCount() > 0 && !game.isGameOver) {
    stockEl.classList.remove("empty");
    const back = buildCardEl(null, { covered: true, onClick: () => handlers.onDraw() });
    stockEl.appendChild(back);
    const badge = document.createElement("div");
    badge.className = "pile-count-badge";
    badge.textContent = game.stockCount();
    stockEl.appendChild(badge);
  } else {
    stockEl.classList.add("empty");
  }

  const guideEl = document.getElementById("guide-card");
  guideEl.innerHTML = "";
  if (game.guideCard) {
    guideEl.appendChild(buildCardEl(game.guideCard, { disabled: true }));
  }
}

export function renderAll(game, handlers) {
  renderHud(game);
  renderPyramid(game, handlers);
  renderTray(game, handlers);
}

export function showGameOverModal(game) {
  const remaining = game.remaining();
  const cleared = TOTAL_PYRAMID_CARDS - remaining;
  document.getElementById("game-over-title").textContent =
    game.outcome === "win" ? "Pyramid Cleared!" : "Game Over";
  document.getElementById("game-over-detail").textContent =
    game.outcome === "win"
      ? `You cleared all ${TOTAL_PYRAMID_CARDS} cards in ${game.moves} moves.`
      : `The stock ran dry with ${remaining} card${remaining === 1 ? "" : "s"} left (${cleared} cleared).`;
  document.getElementById("game-over-modal").classList.remove("hidden");
}
