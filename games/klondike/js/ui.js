import { rankLabel, suitIcon, SUITS } from "./deck.js";
import { TOTAL_CARDS } from "./game.js";

function cardInnerHTML(card) {
  const label = rankLabel(card.rank);
  const icon = suitIcon(card.suit);
  return `<div class="rank-top">${label}</div><div class="suit-icon">${icon}</div><div class="rank-bottom">${label}</div>`;
}

function buildCardEl(card, { faceDown = false, selected = false, legal = false, onClick = null, onDblClick = null } = {}) {
  const el = document.createElement("div");
  const classes = ["card"];
  if (faceDown || !card.faceUp) {
    classes.push("face-down");
  } else {
    classes.push(`suit-${card.suit}`);
  }
  if (selected) classes.push("selected");
  if (legal) classes.push("legal");
  el.className = classes.join(" ");
  if (card.faceUp && !faceDown) el.innerHTML = cardInnerHTML(card);
  if (onClick) el.addEventListener("click", onClick);
  if (onDblClick) el.addEventListener("dblclick", onDblClick);
  return el;
}

function renderHud(game) {
  const statusEl = document.getElementById("status-info");
  if (game.isGameOver) {
    statusEl.textContent = "All four foundations complete!";
  } else {
    statusEl.textContent = "Click a card to select it, then click where it should go.";
  }
  document.getElementById("remaining-badge").textContent = `${game.remaining()} left`;
  document.getElementById("player-status").textContent = game.message || "";
}

function renderStock(game, handlers) {
  const stockEl = document.getElementById("stock-pile");
  stockEl.innerHTML = "";
  stockEl.classList.remove("empty");
  if (game.stock.length > 0) {
    const back = document.createElement("div");
    back.className = "card face-down";
    back.addEventListener("click", () => handlers.onDraw());
    stockEl.appendChild(back);
    const badge = document.createElement("div");
    badge.className = "pile-count-badge";
    badge.textContent = game.stock.length;
    stockEl.appendChild(badge);
  } else if (game.waste.length > 0) {
    stockEl.classList.add("empty");
    const recycle = document.createElement("div");
    recycle.className = "card empty-slot recycle-slot";
    recycle.innerHTML = `<span class="recycle-icon">&#8635;</span>`;
    recycle.addEventListener("click", () => handlers.onDraw());
    stockEl.appendChild(recycle);
  } else {
    stockEl.classList.add("empty");
    const slot = document.createElement("div");
    slot.className = "card empty-slot";
    stockEl.appendChild(slot);
  }
}

function renderWaste(game, handlers) {
  const wasteEl = document.getElementById("waste-pile");
  wasteEl.innerHTML = "";
  if (game.waste.length === 0) {
    const slot = document.createElement("div");
    slot.className = "card empty-slot";
    wasteEl.appendChild(slot);
    return;
  }
  const selected = game.isSelected({ type: "waste" });
  const fan = game.waste.slice(-3); // up to 3 most recently drawn, oldest first
  fan.forEach((card, i) => {
    const isTop = i === fan.length - 1;
    const el = buildCardEl(card, {
      selected: isTop && selected,
      onClick: isTop ? () => handlers.onClickWaste() : null,
      onDblClick: isTop ? () => handlers.onDblClickWaste() : null,
    });
    el.style.position = "absolute";
    el.style.left = `${i * 16}px`;
    el.style.zIndex = String(i);
    if (!isTop) el.classList.add("waste-behind");
    wasteEl.appendChild(el);
  });
}

function renderFoundations(game, handlers) {
  for (const suit of SUITS) {
    const pileEl = document.getElementById(`foundation-${suit}`);
    pileEl.innerHTML = "";
    const top = game.topOfFoundation(suit);
    const legal = !game.isGameOver && game.canDropOnFoundation(suit);
    if (top) {
      const el = buildCardEl(top, { legal, onClick: () => handlers.onClickFoundation(suit) });
      pileEl.appendChild(el);
    } else {
      const slot = document.createElement("div");
      slot.className = "card empty-slot foundation-slot";
      if (legal) slot.classList.add("legal");
      slot.innerHTML = `<span class="foundation-suit-icon suit-${suit}">${suitIcon(suit)}</span>`;
      slot.addEventListener("click", () => handlers.onClickFoundation(suit));
      pileEl.appendChild(slot);
    }
  }
}

function renderTableau(game, handlers) {
  const wrap = document.getElementById("tableau");
  wrap.innerHTML = "";
  game.tableau.forEach((pile, col) => {
    const colEl = document.createElement("div");
    colEl.className = "tableau-col";

    if (pile.length === 0) {
      const legal = !game.isGameOver && game.selection && game.canDropOnTableau(col);
      const slot = document.createElement("div");
      slot.className = "card empty-slot";
      if (legal) slot.classList.add("legal");
      slot.addEventListener("click", () => handlers.onClickEmptyColumn(col));
      colEl.appendChild(slot);
    } else {
      let offset = 0;
      pile.forEach((card, index) => {
        const selected = game.isSelected({ type: "tableau", col, index });
        const isTop = index === pile.length - 1;
        const legal = isTop && !game.isGameOver && game.selection && game.canDropOnTableau(col);
        const el = buildCardEl(card, {
          selected,
          legal,
          onClick: () => handlers.onClickTableau(col, index),
          onDblClick: isTop ? () => handlers.onDblClickTableau(col) : null,
        });
        el.style.top = `${offset}px`;
        el.style.position = "absolute";
        el.style.left = "0";
        colEl.appendChild(el);
        offset += card.faceUp ? Number.parseInt(getStackOffset("up"), 10) : Number.parseInt(getStackOffset("down"), 10);
      });
      colEl.style.height = `calc(var(--card-h) + ${offset}px)`;
      colEl.style.position = "relative";
    }

    wrap.appendChild(colEl);
  });
}

function getStackOffset(kind) {
  const root = getComputedStyle(document.documentElement);
  const value = root.getPropertyValue(kind === "up" ? "--stack-up" : "--stack-down").trim();
  return value || (kind === "up" ? "24" : "12");
}

export function renderAll(game, handlers) {
  renderHud(game);
  renderStock(game, handlers);
  renderWaste(game, handlers);
  renderFoundations(game, handlers);
  renderTableau(game, handlers);
}

export function showGameOverModal(game) {
  document.getElementById("game-over-title").textContent = "You Win!";
  document.getElementById("game-over-detail").textContent =
    `All ${TOTAL_CARDS} cards made it to the foundations in ${game.moves} moves` +
    (game.redeals > 0 ? ` (with ${game.redeals} redeal${game.redeals === 1 ? "" : "s"}).` : ".");
  document.getElementById("game-over-modal").classList.remove("hidden");
}
