import { SUIT_SYMBOL, SUIT_RED, isTwoEyedJack, isOneEyedJack } from "./board-data.js";
import { cardTargets } from "./rules.js";

let selectedCardId = null;

export function resetSelection() { selectedCardId = null; }
export function setSelectedCard(id) { selectedCardId = id; }
export function getSelectedCard() { return selectedCardId; }

function cardText(card) {
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

function cardBadge(card) {
  if (isTwoEyedJack(card)) return "wild";
  if (isOneEyedJack(card)) return "remove";
  return "";
}

function mkBtn(label, onClick, cls) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.className = cls ? `btn ${cls}` : "btn";
  btn.addEventListener("click", onClick);
  return btn;
}

function buildCell(game, cell, targets, handlers) {
  const div = document.createElement("div");
  div.className = "space";
  if (cell.isCorner) div.classList.add("corner");
  if (cell.id === game.lastMove?.cellId) div.classList.add("last-move");

  if (cell.isCorner) {
    div.classList.add("free");
    div.textContent = "★";
  } else {
    const label = document.createElement("div");
    label.className = "card-label";
    label.textContent = cardText(cell.card);
    if (SUIT_RED[cell.card.suit]) label.classList.add("red");
    div.appendChild(label);
  }

  if (cell.chip !== null) {
    const chip = document.createElement("div");
    chip.className = "chip";
    if (cell.locked) chip.classList.add("locked");
    chip.style.background = game.players[cell.chip].color;
    div.appendChild(chip);
  }

  if (targets.kind === "place" && targets.cells.includes(cell.id)) {
    div.classList.add("target-place");
    div.addEventListener("click", () => handlers.onPlaceChip(cell.id));
  } else if (targets.kind === "remove" && targets.cells.includes(cell.id)) {
    div.classList.add("target-remove");
    div.addEventListener("click", () => handlers.onRemoveChip(cell.id));
  }

  return div;
}

function buildHandCard(game, card, isSelected, isTurn, handlers) {
  const btn = document.createElement("button");
  btn.className = "hand-card";
  if (SUIT_RED[card.suit]) btn.classList.add("red");
  if (isSelected) btn.classList.add("selected");
  const badge = cardBadge(card);
  if (badge) btn.classList.add(`badge-${badge}`);

  const dead = cardTargets(game.board, card, 0).kind === "dead";
  if (dead) btn.classList.add("dead");

  btn.textContent = cardText(card);
  if (badge) {
    const tag = document.createElement("span");
    tag.className = "card-tag";
    tag.textContent = badge === "wild" ? "★" : "⊘";
    btn.appendChild(tag);
  }

  btn.disabled = !isTurn;
  btn.addEventListener("click", () => handlers.onSelectCard(card.id));
  return btn;
}

function statusText(game, targets) {
  if (game.gameOver) return game.winnerId !== null ? `${game.players.find((p) => p.id === game.winnerId).name} wins!` : "The game ended in a draw.";
  if (!game.currentPlayer.isHuman) return `${game.currentPlayer.name} is thinking...`;
  if (!selectedCardId) return "Select a card from your hand.";
  if (targets.kind === "place") return "Choose a highlighted space to place your chip.";
  if (targets.kind === "remove") return "Choose an opponent's chip to remove.";
  if (targets.kind === "dead") return "This card is dead - discard it to draw a new one.";
  return "";
}

export function renderAll(game, handlers) {
  const board = document.getElementById("board-grid");
  board.innerHTML = "";

  const humanTurn = game.currentPlayer.isHuman && !game.gameOver;
  let targets = { kind: "none", cells: [] };
  if (humanTurn && selectedCardId) targets = game.targetsFor(0, selectedCardId);

  for (const cell of game.board) {
    board.appendChild(buildCell(game, cell, humanTurn ? targets : { kind: "none", cells: [] }, handlers));
  }

  const handRow = document.getElementById("hand-row");
  handRow.innerHTML = "";
  const human = game.players[0];
  for (const card of human.hand) {
    handRow.appendChild(buildHandCard(game, card, card.id === selectedCardId, humanTurn, handlers));
  }

  document.getElementById("status-text").textContent = statusText(game, targets);

  const discardBtn = document.getElementById("discard-dead-btn");
  discardBtn.classList.toggle("hidden", !(humanTurn && targets.kind === "dead"));
  discardBtn.onclick = () => handlers.onDiscardDead(selectedCardId);

  const cancelBtn = document.getElementById("cancel-select-btn");
  cancelBtn.classList.toggle("hidden", !(humanTurn && selectedCardId));
  cancelBtn.onclick = () => handlers.onCancelSelection();

  const panels = document.getElementById("player-panels");
  panels.innerHTML = "";
  for (const player of game.players) {
    const panel = document.createElement("div");
    panel.className = "player-panel";
    if (player.id === game.currentPlayerIndex && !game.gameOver) panel.classList.add("active-turn");

    const header = document.createElement("div");
    header.className = "panel-header";
    const dot = document.createElement("span");
    dot.className = "player-dot";
    dot.style.background = player.color;
    header.appendChild(dot);
    const name = document.createElement("span");
    name.className = "panel-name";
    name.textContent = player.name;
    header.appendChild(name);
    panel.appendChild(header);

    const seq = document.createElement("div");
    seq.className = "panel-seq";
    seq.textContent = `Sequences: ${player.sequenceCount}/${game.sequencesToWin}`;
    panel.appendChild(seq);

    const cards = document.createElement("div");
    cards.className = "panel-cards";
    cards.textContent = player.isHuman ? `${player.hand.length} cards` : `${player.hand.length} cards in hand`;
    panel.appendChild(cards);

    panels.appendChild(panel);
  }

  const logEl = document.getElementById("game-log");
  logEl.innerHTML = "";
  const recent = game.log.slice(-8);
  recent.forEach((line, i) => {
    const p = document.createElement("div");
    p.className = "log-line" + (i === recent.length - 1 ? " latest" : "");
    p.textContent = line;
    logEl.appendChild(p);
  });
  logEl.scrollTop = logEl.scrollHeight;
}

export function showGameOverModal(game) {
  const modal = document.getElementById("game-over-modal");
  const title = document.getElementById("game-over-title");
  const body = document.getElementById("game-over-body");
  if (game.winnerId !== null) {
    const winner = game.players.find((p) => p.id === game.winnerId);
    title.textContent = winner.isHuman ? "You win!" : `${winner.name} wins!`;
  } else {
    title.textContent = "It's a draw";
  }
  body.innerHTML = "";
  for (const player of game.players) {
    const row = document.createElement("div");
    row.className = "standing-row";
    if (player.id === game.winnerId) row.classList.add("winner-row");
    row.textContent = `${player.name}: ${player.sequenceCount} sequence${player.sequenceCount === 1 ? "" : "s"}`;
    body.appendChild(row);
  }
  modal.classList.remove("hidden");
}
