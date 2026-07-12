import { rankLabel, suitIcon, isSpecial, MAX_RANK } from "./deck.js";
import { canPlayCard } from "./rules.js";

let selectedCardIds = new Set();
let swapSelectedHandId = null;

export function resetSelection() {
  selectedCardIds = new Set();
}

export function getSelectedCardIds() {
  return [...selectedCardIds];
}

function toggleSelection(cardId) {
  if (selectedCardIds.has(cardId)) selectedCardIds.delete(cardId);
  else selectedCardIds.add(cardId);
}

function cardInnerHTML(card) {
  if (card.isJoker) {
    return `<div class="rank-top">JK</div><div class="suit-icon">🃏</div><div class="rank-bottom">JK</div>`;
  }
  const label = rankLabel(card.rank);
  const icon = suitIcon(card.suit);
  return `<div class="rank-top">${label}</div><div class="suit-icon">${icon}</div><div class="rank-bottom">${label}</div>`;
}

function buildCardEl(card, { small = false, selected = false, legal = false, disabled = false, onClick = null } = {}) {
  const el = document.createElement("div");
  const classes = ["card"];
  if (card.isJoker) {
    classes.push("joker");
  } else {
    classes.push(`suit-${card.suit}`);
  }
  if (small) classes.push("small");
  if (selected) classes.push("selected");
  if (legal) classes.push("legal");
  if (isSpecial(card)) classes.push("special");
  if (disabled) classes.push("disabled");
  el.className = classes.join(" ");
  el.innerHTML = cardInnerHTML(card);
  if (onClick && !disabled) el.addEventListener("click", onClick);
  return el;
}

function buildFaceDownEl({ small = false, disabled = false, onClick = null } = {}) {
  const el = document.createElement("div");
  const classes = ["card", "face-down"];
  if (small) classes.push("small");
  if (disabled) classes.push("disabled");
  el.className = classes.join(" ");
  if (onClick && !disabled) el.addEventListener("click", onClick);
  return el;
}

function requirementText(req) {
  if (req.type === "open") return "Any card can be played";
  if (req.type === "sevenOrUnder") return "7 or lower required (2s, 10s, and Jokers always OK)";
  return `${rankLabel(req.minRank)} or higher required (2s, 10s, and Jokers always OK)`;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------- Swap screen ----------

export function renderSwapScreen(game, handlers) {
  const p = game.players[0];
  const handWrap = document.getElementById("swap-hand");
  const faceUpWrap = document.getElementById("swap-faceup");
  handWrap.innerHTML = "";
  faceUpWrap.innerHTML = "";

  p.hand.forEach((card) => {
    const el = buildCardEl(card, {
      selected: swapSelectedHandId === card.id,
      onClick: () => {
        swapSelectedHandId = swapSelectedHandId === card.id ? null : card.id;
        handlers.onRerender();
      },
    });
    handWrap.appendChild(el);
  });

  p.faceUp.forEach((card) => {
    const el = buildCardEl(card, {
      onClick: () => {
        if (swapSelectedHandId) {
          handlers.onSwap(swapSelectedHandId, card.id);
          swapSelectedHandId = null;
        }
      },
    });
    faceUpWrap.appendChild(el);
  });

  document.getElementById("swap-status").textContent = swapSelectedHandId
    ? "Now click a face-up card to swap with."
    : "Click a hand card to begin a swap, or hit Ready.";
}

// ---------- Game screen ----------

function renderHud(game) {
  let turnText;
  if (game.isGameOver) {
    turnText = "Game over";
  } else if (game.currentPlayer.isHuman) {
    const zone = game.currentZone();
    turnText = zone === "faceDown" ? "Your turn — flip a face-down card" : "Your turn — play or pick up the pile";
  } else {
    turnText = `${game.currentPlayer.name} is playing...`;
  }
  document.getElementById("turn-info").textContent = turnText;
  document.getElementById("center-message").textContent = game.message || "";

  const badge = document.getElementById("requirement-info");
  badge.textContent = requirementText(game.pileRequirement);
  badge.classList.toggle("restricted", game.pileRequirement.type === "sevenOrUnder");

  const dirBadge = document.getElementById("direction-info");
  dirBadge.textContent = game.direction === 1 ? "↻ Clockwise" : "↺ Reversed";
}

function renderOpponents(game) {
  const wrap = document.getElementById("opponents");
  wrap.innerHTML = "";
  game.players.forEach((p, idx) => {
    if (p.isHuman) return;
    const div = document.createElement("div");
    div.className = "opponent";
    if (idx === game.currentPlayerIndex && !game.isGameOver) div.classList.add("active-turn");
    if (p.finished) div.classList.add("finished");

    const name = document.createElement("div");
    name.className = "opp-name";
    name.textContent = p.name;
    div.appendChild(name);

    const counts = document.createElement("div");
    counts.className = "opp-counts";
    counts.textContent = `Hand: ${p.hand.length}`;
    div.appendChild(counts);

    const faceUpRow = document.createElement("div");
    faceUpRow.className = "opp-faceup-row";
    p.faceUp.forEach((card) => {
      faceUpRow.appendChild(buildCardEl(card, { small: true, disabled: true }));
    });
    div.appendChild(faceUpRow);

    const faceDownRow = document.createElement("div");
    faceDownRow.className = "opp-card-row";
    p.faceDown.forEach(() => {
      faceDownRow.appendChild(buildFaceDownEl({ small: true, disabled: true }));
    });
    div.appendChild(faceDownRow);

    if (p.finished) {
      const badge = document.createElement("div");
      badge.className = "opp-badge";
      badge.textContent = ordinal(p.finishRank);
      div.appendChild(badge);
    }

    wrap.appendChild(div);
  });
}

function renderPiles(game) {
  const drawEl = document.getElementById("draw-pile");
  drawEl.innerHTML = "";
  if (game.drawPile.length > 0) {
    drawEl.classList.remove("empty");
    drawEl.appendChild(buildFaceDownEl({ disabled: true }));
    const badge = document.createElement("div");
    badge.className = "pile-count-badge";
    badge.textContent = game.drawPile.length;
    drawEl.appendChild(badge);
  } else {
    drawEl.classList.add("empty");
  }

  const playEl = document.getElementById("play-pile");
  playEl.innerHTML = "";
  if (game.pile.length > 0) {
    const top = game.pile[game.pile.length - 1];
    playEl.appendChild(buildCardEl(top, { disabled: true }));
    playEl.classList.remove("empty");
  } else {
    playEl.classList.add("empty");
  }
}

function renderPlayerZones(game, handlers) {
  const p = game.players[0];
  const isMyTurn = game.currentPlayerIndex === 0 && !game.isGameOver;
  const zone = isMyTurn ? game.currentZone() : null;

  const faceDownBlock = document.getElementById("player-facedown").parentElement;
  const faceUpBlock = document.getElementById("player-faceup").parentElement;
  const handBlock = document.getElementById("player-hand").parentElement;
  faceDownBlock.classList.toggle("inactive", zone !== "faceDown");
  faceUpBlock.classList.toggle("inactive", zone !== "faceUp");
  handBlock.classList.toggle("inactive", zone !== "hand");

  const faceDownWrap = document.getElementById("player-facedown");
  faceDownWrap.innerHTML = "";
  p.faceDown.forEach((card) => {
    const clickable = zone === "faceDown";
    faceDownWrap.appendChild(buildFaceDownEl({
      disabled: !clickable,
      onClick: clickable ? () => handlers.onFlipFaceDown(card.id) : null,
    }));
  });

  const faceUpWrap = document.getElementById("player-faceup");
  faceUpWrap.innerHTML = "";
  p.faceUp.forEach((card) => {
    const legal = zone === "faceUp" && canPlayCard(card, game.pileRequirement);
    faceUpWrap.appendChild(buildCardEl(card, {
      selected: selectedCardIds.has(card.id),
      legal,
      disabled: zone !== "faceUp",
      onClick: legal ? () => { handleCardClick(game, "faceUp", card.id); handlers.onRerender(); } : null,
    }));
  });

  const handWrap = document.getElementById("player-hand");
  handWrap.innerHTML = "";
  p.hand.forEach((card) => {
    const legal = zone === "hand" && canPlayCard(card, game.pileRequirement);
    handWrap.appendChild(buildCardEl(card, {
      selected: selectedCardIds.has(card.id),
      legal,
      disabled: zone !== "hand",
      onClick: legal ? () => { handleCardClick(game, "hand", card.id); handlers.onRerender(); } : null,
    }));
  });

  document.getElementById("play-btn").disabled = !(isMyTurn && selectedCardIds.size > 0);
  const canPickUp = isMyTurn && (zone === "hand" || zone === "faceUp") &&
    game.pile.length > 0 && !game.hasAnyLegalPlay(0);
  document.getElementById("pickup-btn").disabled = !canPickUp;
}

const SUIT_ORDER = ["hearts", "diamonds", "clubs", "spades"];

// Jokers have no rank/suit to compare - sort them consistently to the end.
function rankSortKey(card) {
  return card.isJoker ? MAX_RANK + 1 : card.rank;
}
function suitSortKey(card) {
  return card.isJoker ? SUIT_ORDER.length : SUIT_ORDER.indexOf(card.suit);
}

export function sortHandByRank(game) {
  game.players[0].hand.sort((a, b) => rankSortKey(a) - rankSortKey(b) || suitSortKey(a) - suitSortKey(b));
}

export function sortHandBySuit(game) {
  game.players[0].hand.sort((a, b) => suitSortKey(a) - suitSortKey(b) || rankSortKey(a) - rankSortKey(b));
}

function handleCardClick(game, zone, cardId) {
  const p = game.players[0];
  const card = p[zone].find((c) => c.id === cardId);
  if (!card) return;
  if (selectedCardIds.size > 0) {
    const firstId = [...selectedCardIds][0];
    const firstCard = p[zone].find((c) => c.id === firstId);
    if (firstCard && firstCard.rank !== card.rank) {
      selectedCardIds = new Set();
    }
  }
  toggleSelection(cardId);
}

export function renderAll(game, handlers) {
  renderHud(game);
  renderOpponents(game);
  renderPiles(game);
  renderPlayerZones(game, handlers);
}

export function setStatus(text) {
  document.getElementById("player-status").textContent = text || "";
}

export function showGameOverModal(game) {
  const wrap = document.getElementById("final-standings");
  wrap.innerHTML = "";
  const standings = game.standings();
  standings.forEach((p) => {
    const row = document.createElement("div");
    row.className = "standing-row";
    const label = p.finishRank === 1 ? `${ordinal(p.finishRank)} — Winner!` : ordinal(p.finishRank);
    if (p.finishRank === 1) row.classList.add("rank-1");
    row.innerHTML = `<span>${p.name}</span><span>${label}</span>`;
    wrap.appendChild(row);
  });
  document.getElementById("game-over-modal").classList.remove("hidden");
}
