import { rankLabel, rankLabelPlural, suitIcon } from "./deck.js";

let selectedCardIds = new Set();

export function resetSelection() {
  selectedCardIds = new Set();
}

export function getSelectedCardIds() {
  return [...selectedCardIds];
}

function toggleSelection(cardId) {
  if (selectedCardIds.has(cardId)) selectedCardIds.delete(cardId);
  else if (selectedCardIds.size < 4) selectedCardIds.add(cardId);
}

function cardInnerHTML(card) {
  const label = rankLabel(card.rank);
  const icon = suitIcon(card.suit);
  return `<div class="rank-top">${label}</div><div class="suit-icon">${icon}</div><div class="rank-bottom">${label}</div>`;
}

function buildCardEl(card, { selected = false, disabled = false, onClick = null } = {}) {
  const el = document.createElement("div");
  const classes = ["card", `suit-${card.suit}`];
  if (selected) classes.push("selected");
  if (disabled) classes.push("disabled");
  el.className = classes.join(" ");
  el.innerHTML = cardInnerHTML(card);
  if (onClick && !disabled) el.addEventListener("click", onClick);
  return el;
}

function buildFaceDownEl({ small = false } = {}) {
  const el = document.createElement("div");
  el.className = small ? "card face-down small" : "card face-down";
  return el;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function renderHud(game) {
  let turnText;
  if (game.isGameOver) {
    turnText = "Game over";
  } else if (game.pendingPlay) {
    const challenger = game.nextChallenger();
    if (challenger === 0) {
      turnText = "Call it, or let it ride?";
    } else if (challenger !== null) {
      turnText = `${game.players[challenger].name} is deciding...`;
    } else {
      turnText = "Resolving...";
    }
  } else if (game.currentPlayer.isHuman) {
    turnText = "Your turn - play 1 to 4 cards";
  } else {
    turnText = `${game.currentPlayer.name} is playing...`;
  }
  document.getElementById("turn-info").textContent = turnText;

  const badge = document.getElementById("required-rank-info");
  badge.textContent = game.isGameOver ? "" : `Must claim: ${rankLabelPlural(game.requiredRank())}`;
}

function renderLog(game) {
  const wrap = document.getElementById("game-log");
  wrap.innerHTML = "";
  const recent = game.log.slice(-6);
  recent.forEach((line, i) => {
    const div = document.createElement("div");
    div.className = "log-line";
    if (i === recent.length - 1) div.classList.add("latest");
    div.textContent = line;
    wrap.appendChild(div);
  });
  wrap.scrollTop = wrap.scrollHeight;
}

function renderOpponents(game) {
  const wrap = document.getElementById("opponents");
  wrap.innerHTML = "";
  game.players.forEach((p, idx) => {
    if (p.isHuman) return;
    const div = document.createElement("div");
    div.className = "opponent";
    if (idx === game.currentPlayerIndex && !game.pendingPlay && !game.isGameOver) div.classList.add("active-turn");
    if (game.pendingPlay && game.nextChallenger() === idx) div.classList.add("deciding");
    if (p.finished) div.classList.add("finished");

    const name = document.createElement("div");
    name.className = "opp-name";
    name.textContent = p.name;
    div.appendChild(name);

    const counts = document.createElement("div");
    counts.className = "opp-counts";
    counts.textContent = `${p.hand.length} card${p.hand.length === 1 ? "" : "s"}`;
    div.appendChild(counts);

    const row = document.createElement("div");
    row.className = "opp-card-row";
    const shown = Math.min(p.hand.length, 8);
    for (let i = 0; i < shown; i++) row.appendChild(buildFaceDownEl({ small: true }));
    div.appendChild(row);

    if (p.finished) {
      const badge = document.createElement("div");
      badge.className = "opp-badge";
      badge.textContent = ordinal(p.finishRank);
      div.appendChild(badge);
    }

    wrap.appendChild(div);
  });
}

function renderTable(game) {
  const pileEl = document.getElementById("center-pile");
  pileEl.innerHTML = "";
  if (game.pile.length > 0) {
    pileEl.classList.remove("empty");
    pileEl.appendChild(buildFaceDownEl({}));
    const badge = document.createElement("div");
    badge.className = "pile-count-badge";
    badge.textContent = game.pile.length;
    pileEl.appendChild(badge);
  } else {
    pileEl.classList.add("empty");
  }

  const pendingWrap = document.getElementById("pending-play");
  pendingWrap.innerHTML = "";
  if (game.pendingPlay) {
    pendingWrap.classList.remove("hidden");
    const { playerIdx, claimedRank, cards } = game.pendingPlay;
    const player = game.players[playerIdx];

    const stack = document.createElement("div");
    stack.className = "pending-stack";
    cards.forEach(() => stack.appendChild(buildFaceDownEl({ small: true })));
    pendingWrap.appendChild(stack);

    const claim = document.createElement("div");
    claim.className = "pending-claim";
    claim.textContent = `${player.isHuman ? "You" : player.name} claim${player.isHuman ? "" : "s"}: ` +
      `${cards.length} × ${rankLabelPlural(claimedRank)}`;
    pendingWrap.appendChild(claim);
  } else {
    pendingWrap.classList.add("hidden");
  }
}

function renderChallengeControls(game, handlers) {
  const wrap = document.getElementById("challenge-controls");
  const isMyDecision = game.pendingPlay && game.nextChallenger() === 0;
  wrap.classList.toggle("hidden", !isMyDecision);
  document.getElementById("call-bs-btn").onclick = () => handlers.onCallBullshit();
  document.getElementById("trust-btn").onclick = () => handlers.onPassChallenge();
}

function renderPlayerHand(game, handlers) {
  const p = game.players[0];
  const isMyTurn = game.currentPlayerIndex === 0 && !game.pendingPlay && !game.isGameOver;

  const handWrap = document.getElementById("player-hand");
  handWrap.innerHTML = "";
  p.hand.forEach((card) => {
    handWrap.appendChild(buildCardEl(card, {
      selected: selectedCardIds.has(card.id),
      disabled: !isMyTurn,
      onClick: () => { toggleSelection(card.id); handlers.onRerender(); },
    }));
  });

  const playBtn = document.getElementById("play-btn");
  playBtn.disabled = !(isMyTurn && selectedCardIds.size > 0);
  playBtn.textContent = selectedCardIds.size > 0
    ? `Play ${selectedCardIds.size} as ${rankLabelPlural(game.requiredRank())}`
    : "Play Selected";
}

export function renderAll(game, handlers) {
  renderHud(game);
  renderLog(game);
  renderOpponents(game);
  renderTable(game);
  renderChallengeControls(game, handlers);
  renderPlayerHand(game, handlers);
}

export function showGameOverModal(game) {
  const wrap = document.getElementById("final-standings");
  wrap.innerHTML = "";
  game.standings().forEach((p) => {
    const row = document.createElement("div");
    row.className = "standing-row";
    const label = p.finishRank === 1 ? `${ordinal(p.finishRank)} — Winner!` : ordinal(p.finishRank);
    if (p.finishRank === 1) row.classList.add("rank-1");
    row.innerHTML = `<span>${p.name}</span><span>${label}</span>`;
    wrap.appendChild(row);
  });
  document.getElementById("game-over-modal").classList.remove("hidden");
}
