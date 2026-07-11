import { rankLabel, suitIcon, isWildCard } from "./deck.js";
import { evaluateHand } from "./rules.js";

// Categorical palette (dark-mode steps), validated against this app's dark
// green modal surface (#0f4331) via the dataviz skill's validator - fixed
// slot order is the CVD-safety mechanism, never reassigned by ranking.
const CHART_COLORS = ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767"];
const CHART_INK_MUTED = "#c9d2cc";
const CHART_INK_SECONDARY = "#f2f2ee";
const CHART_GRID = "rgba(255,255,255,0.14)";
const CHART_SURFACE = "#0f4331";

function playerColor(game, playerId) {
  const idx = game.players.findIndex((p) => p.id === playerId);
  return CHART_COLORS[idx % CHART_COLORS.length];
}

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
    const wrap = document.createElement("div");
    wrap.className = "round-summary-block";

    const row = document.createElement("div");
    row.className = "round-summary-row";
    if (p.wentOut) row.classList.add("winner");
    const roundScore = p.roundScores[p.roundScores.length - 1];
    row.innerHTML = `<span>${p.name}${p.wentOut ? " (went out)" : ""}</span><span>+${roundScore} → ${p.totalScore}</span>`;
    wrap.appendChild(row);

    const handRow = document.createElement("div");
    handRow.className = "round-summary-hand";
    const evalResult = evaluateHand(p.hand, game.wildRank);
    const matchedIds = new Set();
    evalResult.groups.forEach((g) => g.cardIds.forEach((id) => matchedIds.add(id)));
    p.hand.forEach((card) => {
      const el = buildCardEl(card, {
        small: true,
        wildRank: game.wildRank,
        matched: matchedIds.has(card.id),
      });
      handRow.appendChild(el);
    });
    wrap.appendChild(handRow);

    body.appendChild(wrap);
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

  // Always ordered by current placement (lowest total first), not join order.
  const ranked = game.players.slice().sort((a, b) => a.totalScore - b.totalScore);

  const thead = document.createElement("tr");
  thead.innerHTML = "<th>Round</th>" + ranked.map((p) => `<th>${p.name}</th>`).join("");
  table.appendChild(thead);

  const roundsPlayed = game.players[0].roundScores.length;
  for (let r = 0; r < roundsPlayed; r++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r + 1}</td>` + ranked.map((p) => `<td>${p.roundScores[r] ?? "-"}</td>`).join("");
    table.appendChild(tr);
  }

  const totalTr = document.createElement("tr");
  totalTr.innerHTML = `<td class="total-row">Total</td>` + ranked.map((p) => `<td class="total-row">${p.totalScore}</td>`).join("");
  table.appendChild(totalTr);

  wrap.innerHTML = "";
  wrap.appendChild(table);
  document.getElementById("scores-modal").classList.remove("hidden");
}

export function hideScoresModal() {
  document.getElementById("scores-modal").classList.add("hidden");
}

function niceTicks(maxValue, targetCount = 5) {
  if (maxValue <= 0) return [0, 10, 20, 30, 40];
  const rawStep = maxValue / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let step;
  if (residual > 5) step = 10 * magnitude;
  else if (residual > 2) step = 5 * magnitude;
  else if (residual > 1) step = 2 * magnitude;
  else step = magnitude;
  const ticks = [];
  for (let t = 0; t <= maxValue + step; t += step) ticks.push(Math.round(t));
  return ticks;
}

function buildScoreLineChartSVG(game) {
  const roundsPlayed = game.players[0].roundScores.length;
  if (roundsPlayed === 0) return "";

  const series = game.players.map((p) => {
    let running = 0;
    const cum = p.roundScores.map((s) => (running += s));
    return { id: p.id, name: p.name, color: playerColor(game, p.id), cum };
  });

  const maxScore = Math.max(1, ...series.map((s) => s.cum[s.cum.length - 1]));
  const ticks = niceTicks(maxScore);
  const maxTick = ticks[ticks.length - 1];

  const width = 600;
  const height = 300;
  const marginLeft = 40;
  const marginRight = 96;
  const marginTop = 16;
  const marginBottom = 28;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  const xScale = (round) =>
    marginLeft + (roundsPlayed === 1 ? 0 : ((round - 1) / (roundsPlayed - 1)) * plotW);
  const yScale = (value) => marginTop + plotH - (value / maxTick) * plotH;

  let svg = "";

  // Gridlines + y-axis labels (hairline, recessive; ticks carry values not directly labeled).
  ticks.forEach((t) => {
    const y = yScale(t);
    svg += `<line x1="${marginLeft}" y1="${y}" x2="${marginLeft + plotW}" y2="${y}" stroke="${CHART_GRID}" stroke-width="1"/>`;
    svg += `<text x="${marginLeft - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${CHART_INK_MUTED}">${t}</text>`;
  });

  // X-axis round labels.
  for (let r = 1; r <= roundsPlayed; r++) {
    if (roundsPlayed > 11 && r % 2 === 0) continue; // shouldn't happen (11 rounds max) but guards crowding
    svg += `<text x="${xScale(r)}" y="${height - 6}" text-anchor="middle" font-size="10" fill="${CHART_INK_MUTED}">${r}</text>`;
  }

  // One polyline + end-dot per player, in fixed color-slot order (identity, not rank).
  const labelTargets = [];
  series.forEach((s) => {
    const points = s.cum.map((v, i) => `${xScale(i + 1)},${yScale(v)}`).join(" ");
    svg += `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    const endX = xScale(roundsPlayed);
    const endY = yScale(s.cum[s.cum.length - 1]);
    svg += `<circle cx="${endX}" cy="${endY}" r="4" fill="${s.color}" stroke="${CHART_SURFACE}" stroke-width="2"/>`;
    labelTargets.push({ name: s.name, color: s.color, endX, endY, y: endY });
  });

  // Declutter end-labels: enforce a minimum vertical gap, cascading downward.
  labelTargets.sort((a, b) => a.y - b.y);
  const MIN_GAP = 15;
  for (let i = 1; i < labelTargets.length; i++) {
    if (labelTargets[i].y - labelTargets[i - 1].y < MIN_GAP) {
      labelTargets[i].y = labelTargets[i - 1].y + MIN_GAP;
    }
  }
  labelTargets.forEach((t) => {
    const labelX = marginLeft + plotW + 10;
    if (Math.abs(t.y - t.endY) > 3) {
      svg += `<line x1="${t.endX}" y1="${t.endY}" x2="${labelX - 6}" y2="${t.y}" stroke="${t.color}" stroke-width="1" stroke-dasharray="2,2" opacity="0.6"/>`;
    }
    svg += `<circle cx="${labelX}" cy="${t.y}" r="4" fill="${t.color}"/>`;
    svg += `<text x="${labelX + 8}" y="${t.y + 4}" font-size="12" fill="${CHART_INK_SECONDARY}">${t.name}</text>`;
  });

  return `<svg viewBox="0 0 ${width} ${height}" class="score-chart" role="img" aria-label="Cumulative score by round for each player">${svg}</svg>`;
}

export function showGameOverModal(game) {
  const chartWrap = document.getElementById("score-chart-wrap");
  chartWrap.innerHTML = `<div class="chart-caption">Cumulative score by round &middot; lower is better</div>${buildScoreLineChartSVG(game)}`;

  const wrap = document.getElementById("final-standings");
  wrap.innerHTML = "";
  const standings = game.standings();
  standings.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "standing-row" + (i === 0 ? " rank-1" : "");
    const dot = `<span class="legend-dot" style="background:${playerColor(game, s.id)}"></span>`;
    row.innerHTML = `<span>${dot}${i + 1}. ${s.name}${s.isHuman ? " (You)" : ""}</span><span>${s.totalScore}</span>`;
    wrap.appendChild(row);
  });
  document.getElementById("game-over-modal").classList.remove("hidden");
}
