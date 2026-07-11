import { rankLabel, suitIcon, isWildCard } from "./deck.js";
import { evaluateHand } from "./rules.js";

let selectedCardId = null;

export function resetSelection() {
  selectedCardId = null;
}

export function getSelectedCardId() {
  return selectedCardId;
}

function wildRankLabel(wildRank) {
  return rankLabel(wildRank) + "s";
}

function cardInnerHTML(card) {
  if (card.isJoker) {
    return `<div class="rank-top">JK</div><div class="suit-icon">🃏</div><div class="rank-bottom">JK</div>`;
  }
  const label = rankLabel(card.rank);
  const icon = suitIcon(card.suit);
  return `<div class="rank-top">${label}</div><div class="suit-icon">${icon}</div><div class="rank-bottom">${label}</div>`;
}

function buildCardEl(card, { small = false, wildRank = null, matched = false, selected = false, onClick = null } = {}) {
  const el = document.createElement("div");
  const classes = ["card"];
  if (card.isJoker) {
    classes.push("joker");
  } else {
    classes.push(`suit-${card.suit}`);
  }
  if (small) classes.push("small");
  if (wildRank != null && isWildCard(card, wildRank)) classes.push("wild");
  if (matched) classes.push("matched");
  if (selected) classes.push("selected");
  el.className = classes.join(" ");
  el.innerHTML = cardInnerHTML(card);
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

function roundWildLabel(game) {
  return wildRankLabel(game.wildRank);
}

function renderHud(game) {
  document.getElementById("round-info").textContent =
    `Round ${game.round} of 11 · ${game.handSize} cards · Wild: ${roundWildLabel(game)}`;

  let turnText;
  if (game.roundOver) {
    turnText = "Round complete";
  } else if (game.currentPlayer.isHuman) {
    turnText = game.turnPhase === "draw" ? "Your turn — draw a card" : "Your turn — discard or go out";
  } else {
    turnText = `${game.currentPlayer.name} is playing...`;
  }
  document.getElementById("turn-info").textContent = turnText;
  document.getElementById("center-message").textContent = game.message || "";
}

function renderOpponents(game) {
  const wrap = document.getElementById("opponents");
  wrap.innerHTML = "";
  game.players.forEach((p, idx) => {
    if (p.isHuman) return;
    const div = document.createElement("div");
    div.className = "opponent";
    if (idx === game.currentPlayerIndex && !game.roundOver) div.classList.add("active-turn");
    if (p.wentOut) div.classList.add("out-of-round");

    const name = document.createElement("div");
    name.className = "opp-name";
    name.textContent = p.name;
    div.appendChild(name);

    const count = document.createElement("div");
    count.className = "opp-cardcount";
    count.textContent = `${p.hand.length} cards`;
    div.appendChild(count);

    const row = document.createElement("div");
    row.className = "opp-cardback-row";
    const shown = Math.min(p.hand.length, 13);
    for (let i = 0; i < shown; i++) {
      const back = document.createElement("div");
      back.className = "opp-cardback";
      row.appendChild(back);
    }
    div.appendChild(row);

    if (p.wentOut) {
      const badge = document.createElement("div");
      badge.className = "opp-badge";
      badge.textContent = "OUT";
      div.appendChild(badge);
    }

    wrap.appendChild(div);
  });
}

function renderPiles(game, handlers) {
  const stockEl = document.getElementById("stock-pile");
  stockEl.innerHTML = "";
  stockEl.className = "pile stock";
  const canDrawStock = game.currentPlayer.isHuman && game.turnPhase === "draw" && !game.roundOver;
  if (!canDrawStock) stockEl.classList.add("disabled");
  stockEl.textContent = `${game.stock.length}`;
  stockEl.onclick = canDrawStock ? handlers.onDrawStock : null;

  const discardEl = document.getElementById("discard-pile");
  discardEl.innerHTML = "";
  discardEl.className = "pile discard";
  const top = game.discard[game.discard.length - 1];
  const canDrawDiscard = game.currentPlayer.isHuman && game.turnPhase === "draw" && !game.roundOver && !!top;
  if (top) {
    const cardEl = buildCardEl(top, { wildRank: game.wildRank });
    discardEl.appendChild(cardEl);
  } else {
    discardEl.classList.add("empty");
  }
  if (!canDrawDiscard) discardEl.classList.add("disabled");
  discardEl.onclick = canDrawDiscard ? handlers.onDrawDiscard : null;
}

function renderHand(game, handlers) {
  const human = game.players[0];
  const handEl = document.getElementById("player-hand");
  handEl.innerHTML = "";

  const evalResult = evaluateHand(human.hand, game.wildRank);
  const matchedIds = new Set();
  evalResult.groups.forEach((g) => g.cardIds.forEach((id) => matchedIds.add(id)));

  const canAct = game.currentPlayer.isHuman && !game.roundOver;
  const inDiscardPhase = canAct && game.turnPhase === "discard";

  human.hand.forEach((card) => {
    const el = buildCardEl(card, {
      wildRank: game.wildRank,
      matched: matchedIds.has(card.id),
      selected: selectedCardId === card.id,
      onClick: inDiscardPhase
        ? () => {
            selectedCardId = selectedCardId === card.id ? null : card.id;
            handlers.onRerender();
          }
        : null,
    });
    handEl.appendChild(el);
  });

  const statusEl = document.getElementById("player-status");
  const canGoOutSelected = inDiscardPhase && selectedCardId != null && game.canGoOutWithCard(0, selectedCardId);

  if (game.roundOver) {
    statusEl.textContent = "";
  } else if (!game.currentPlayer.isHuman) {
    statusEl.textContent = "";
  } else if (game.turnPhase === "draw") {
    statusEl.textContent = "Draw from the stock or take the discard.";
  } else if (selectedCardId != null) {
    const remaining = human.hand.filter((c) => c.id !== selectedCardId);
    const remainingDeadwood = evaluateHand(remaining, game.wildRank).deadwoodValue;
    statusEl.textContent = canGoOutSelected
      ? "Discarding that card leaves your hand fully matched — you can go out!"
      : `Deadwood if you discard that card: ${remainingDeadwood} points.`;
  } else if (game.hasGoOutOption(0)) {
    statusEl.textContent = "You can go out this turn — select the card to discard, then press Go Out.";
  } else {
    statusEl.textContent = `Select a card to discard. Best case deadwood: ${evalResult.deadwoodValue} points.`;
  }

  const discardBtn = document.getElementById("discard-btn");
  const canDiscardSelected = inDiscardPhase && selectedCardId != null && game.canDiscard(0, selectedCardId);
  discardBtn.disabled = !canDiscardSelected;

  const goOutBtn = document.getElementById("go-out-btn");
  goOutBtn.disabled = !canGoOutSelected;
}

export function renderAll(game, handlers) {
  renderHud(game);
  renderOpponents(game);
  renderPiles(game, handlers);
  renderHand(game, handlers);
}

export function sortHandBySuit(game) {
  const human = game.players[0];
  const suitOrder = { stars: 0, hearts: 1, clubs: 2, diamonds: 3, spades: 4 };
  human.hand.sort((a, b) => {
    if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
    if (a.isJoker) return 0;
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
    return a.rank - b.rank;
  });
}

export function sortHandByRank(game) {
  const human = game.players[0];
  human.hand.sort((a, b) => {
    if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
    if (a.isJoker) return 0;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.suit.localeCompare(b.suit);
  });
}

export function autoArrangeHand(game) {
  const human = game.players[0];
  const evalResult = evaluateHand(human.hand, game.wildRank);
  const order = [];
  const placed = new Set();
  evalResult.groups.forEach((g) => {
    g.cardIds.forEach((id) => {
      if (!placed.has(id)) {
        placed.add(id);
        order.push(id);
      }
    });
  });
  evalResult.deadwoodCardIds.forEach((id) => {
    if (!placed.has(id)) {
      placed.add(id);
      order.push(id);
    }
  });
  const byId = new Map(human.hand.map((c) => [c.id, c]));
  human.hand = order.map((id) => byId.get(id));
}

export function showRoundModal(game, onContinue) {
  const modal = document.getElementById("round-modal");
  const title = document.getElementById("round-modal-title");
  const body = document.getElementById("round-modal-body");
  const btn = document.getElementById("round-modal-continue-btn");

  title.textContent = `Round ${game.round} Results`;
  body.innerHTML = "";
  const sorted = game.players.slice().sort((a, b) => a.roundScores[a.roundScores.length - 1] - b.roundScores[b.roundScores.length - 1]);
  sorted.forEach((p) => {
    const row = document.createElement("div");
    row.className = "round-summary-row";
    if (p.wentOut) row.classList.add("winner");
    const roundScore = p.roundScores[p.roundScores.length - 1];
    row.innerHTML = `<span>${p.name}${p.wentOut ? " (went out)" : ""}</span><span>+${roundScore} → ${p.totalScore}</span>`;
    body.appendChild(row);
  });

  btn.textContent = game.gameOver ? "See Final Standings" : "Continue";
  btn.onclick = onContinue;
  modal.classList.remove("hidden");
}

export function hideRoundModal() {
  document.getElementById("round-modal").classList.add("hidden");
}

export function showScoresModal(game) {
  const wrap = document.getElementById("scores-table-wrap");
  const table = document.createElement("table");
  table.className = "score-table";

  const thead = document.createElement("tr");
  thead.innerHTML = "<th>Round</th>" + game.players.map((p) => `<th>${p.name}</th>`).join("");
  table.appendChild(thead);

  const roundsPlayed = game.players[0].roundScores.length;
  for (let r = 0; r < roundsPlayed; r++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r + 1}</td>` + game.players.map((p) => `<td>${p.roundScores[r] ?? "-"}</td>`).join("");
    table.appendChild(tr);
  }

  const totalTr = document.createElement("tr");
  totalTr.innerHTML = `<td class="total-row">Total</td>` + game.players.map((p) => `<td class="total-row">${p.totalScore}</td>`).join("");
  table.appendChild(totalTr);

  wrap.innerHTML = "";
  wrap.appendChild(table);
  document.getElementById("scores-modal").classList.remove("hidden");
}

export function hideScoresModal() {
  document.getElementById("scores-modal").classList.add("hidden");
}

export function showGameOverModal(game) {
  const wrap = document.getElementById("final-standings");
  wrap.innerHTML = "";
  const standings = game.standings();
  standings.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "standing-row" + (i === 0 ? " rank-1" : "");
    row.innerHTML = `<span>${i + 1}. ${s.name}${s.isHuman ? " (You)" : ""}</span><span>${s.totalScore}</span>`;
    wrap.appendChild(row);
  });
  document.getElementById("game-over-modal").classList.remove("hidden");
}
