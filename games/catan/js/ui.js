// All DOM rendering for Catan. Pure presentation - reads `game` (from
// game.js) and `uiState` (transient placement/modal state owned by
// main.js) and wires DOM events back to the handlers main.js supplies.

import { PIPS, BUILD_COSTS } from "./board-data.js";
import { publicVictoryPoints, totalVictoryPoints, bestTradeRate } from "./rules.js";
import { DEV_CARD_LABELS } from "./cards.js";

const RESOURCE_COLORS = {
  wood: "#2f6b3a", brick: "#b5502e", sheep: "#8bc34a", wheat: "#e0b93d", ore: "#7d8791", desert: "#d9c48f",
};
const RESOURCE_LABELS = { wood: "Wood", brick: "Brick", sheep: "Sheep", wheat: "Wheat", ore: "Ore" };
const RESOURCE_ABBR = { wood: "Wd", brick: "Bk", sheep: "Sh", wheat: "Wh", ore: "Or" };
const RESOURCE_LIST = ["wood", "brick", "sheep", "wheat", "ore"];

function el(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---------- board geometry helpers ----------

function boardBounds(board) {
  const xs = board.nodes.map((n) => n.x);
  const ys = board.nodes.map((n) => n.y);
  const pad = 95;
  return { minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad, maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad };
}

function portIconText(type) {
  return type === "3:1" ? "3:1" : `2:1`;
}

function legalTargets(game, uiState) {
  const nodes = new Set();
  const edges = new Set();
  const hexes = new Set();

  if (game.phase === "setup" && game.currentSetupPlayerIdx() === 0) {
    if (game.setupState.subPhase === "settlement") game.legalSettlementNodes(0).forEach((n) => nodes.add(n));
    else game.legalRoadEdges(0).forEach((e) => edges.add(e));
  } else if (game.phase === "playing" && game.currentPlayerIndex === 0) {
    if (game.turnPhase === "robberMove") {
      game.board.hexes.forEach((h) => { if (h.id !== game.board.robberHexId) hexes.add(h.id); });
    } else if (game.turnPhase === "actions") {
      if (uiState.mode === "settlement") game.legalSettlementNodes(0).forEach((n) => nodes.add(n));
      else if (uiState.mode === "city") game.legalCityNodes(0).forEach((n) => nodes.add(n));
      else if (uiState.mode === "road") game.legalRoadEdges(0).forEach((e) => edges.add(e));
      else if (uiState.mode === "roadBuilding") {
        game.legalRoadEdges(0).forEach((e) => { if (!uiState.roadBuildingPicked.includes(e)) edges.add(e); });
      }
    }
  }
  return { nodes, edges, hexes };
}

function renderBoardSvg(game, uiState) {
  const { board } = game;
  const b = boardBounds(board);
  const { nodes: legalNodes, edges: legalEdges, hexes: legalHexes } = legalTargets(game, uiState);

  const parts = [];
  parts.push(`<svg id="board-svg" viewBox="${b.minX} ${b.minY} ${b.maxX - b.minX} ${b.maxY - b.minY}" xmlns="http://www.w3.org/2000/svg">`);

  parts.push(`<g class="hexes">`);
  for (const hex of board.hexes) {
    const pts = hex.cornerNodeIds.map((nid) => { const n = board.nodes[nid]; return `${n.x},${n.y}`; }).join(" ");
    const isLegal = legalHexes.has(hex.id);
    parts.push(`<polygon class="hex-tile${isLegal ? " hex-legal" : ""}" data-hex-id="${hex.id}" points="${pts}" fill="${RESOURCE_COLORS[hex.resource]}" />`);
    if (hex.number) {
      const pips = "•".repeat(PIPS[hex.number] || 0);
      const hot = hex.number === 6 || hex.number === 8;
      parts.push(`
        <circle class="number-token" cx="${hex.x}" cy="${hex.y}" r="26" />
        <text class="number-text${hot ? " hot" : ""}" x="${hex.x}" y="${hex.y + 2}" text-anchor="middle">${hex.number}</text>
        <text class="pip-text" x="${hex.x}" y="${hex.y + 18}" text-anchor="middle">${pips}</text>
      `);
    }
    if (hex.id === board.robberHexId) {
      parts.push(`<g class="robber-token" transform="translate(${hex.x - 32}, ${hex.y - 40})"><ellipse cx="10" cy="34" rx="13" ry="5"/><path d="M10 2 C1 2 -3 12 2 20 L -2 34 L 22 34 L 18 20 C 23 12 19 2 10 2 Z"/></g>`);
    }
  }
  parts.push(`</g>`);

  parts.push(`<g class="ports">`);
  for (const port of board.ports) {
    const a = board.nodes[port.nodeIds[0]];
    const c = board.nodes[port.nodeIds[1]];
    const mx = (a.x + c.x) / 2;
    const my = (a.y + c.y) / 2;
    const boardCx = (b.minX + b.maxX) / 2;
    const boardCy = (b.minY + b.maxY) / 2;
    const dx = mx - boardCx;
    const dy = my - boardCy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = mx + (dx / dist) * 46;
    const py = my + (dy / dist) * 46;
    const color = port.type === "3:1" ? "#9aa0a6" : RESOURCE_COLORS[port.type];
    parts.push(`
      <line class="port-line" x1="${a.x}" y1="${a.y}" x2="${px}" y2="${py}" />
      <line class="port-line" x1="${c.x}" y1="${c.y}" x2="${px}" y2="${py}" />
      <circle class="port-badge" cx="${px}" cy="${py}" r="20" fill="${color}" />
      <text class="port-text" x="${px}" y="${py + 4}" text-anchor="middle">${portIconText(port.type)}</text>
    `);
  }
  parts.push(`</g>`);

  parts.push(`<g class="edges">`);
  for (const edge of board.edges) {
    const [a, c] = edge.nodeIds.map((nid) => board.nodes[nid]);
    const owner = edge.road !== null ? game.players[edge.road] : null;
    const isLegal = legalEdges.has(edge.id);
    const classes = ["edge-line"];
    if (owner) classes.push("edge-built");
    if (isLegal) classes.push("edge-legal");
    parts.push(`<line class="${classes.join(" ")}" data-edge-id="${edge.id}" x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="${owner ? owner.color : "transparent"}" />`);
  }
  parts.push(`</g>`);

  parts.push(`<g class="nodes">`);
  for (const node of board.nodes) {
    const isLegal = legalNodes.has(node.id);
    if (node.building) {
      const color = game.players[node.building.ownerId].color;
      if (node.building.type === "city") {
        parts.push(`<rect class="city-icon" data-node-id="${node.id}" x="${node.x - 11}" y="${node.y - 11}" width="22" height="22" fill="${color}" />`);
      } else {
        parts.push(`<polygon class="settlement-icon" data-node-id="${node.id}" points="${node.x},${node.y - 11} ${node.x + 9},${node.y - 2} ${node.x + 9},${node.y + 10} ${node.x - 9},${node.y + 10} ${node.x - 9},${node.y - 2}" fill="${color}" />`);
      }
    } else {
      parts.push(`<circle class="node-dot${isLegal ? " node-legal" : ""}" data-node-id="${node.id}" cx="${node.x}" cy="${node.y}" r="${isLegal ? 11 : 4}" />`);
    }
  }
  parts.push(`</g>`);

  parts.push(`</svg>`);
  return parts.join("");
}

// ---------- HUD ----------

function turnBannerText(game) {
  if (game.phase === "setup") {
    const idx = game.currentSetupPlayerIdx();
    const step = game.setupState.subPhase === "settlement" ? "a settlement" : "a road";
    return idx === 0 ? `Place ${step}.` : `${game.nameFor(idx)} is placing ${step}...`;
  }
  if (game.phase === "gameOver") return `${game.nameFor(game.winner)} wins!`;
  const cur = game.nameFor(game.currentPlayerIndex);
  switch (game.turnPhase) {
    case "preRoll": return game.currentPlayerIndex === 0 ? "Roll the dice." : `${cur} is rolling...`;
    case "discard": {
      const you = game.pendingDiscards.find((d) => d.playerIdx === 0);
      return you ? `Discard ${you.count} cards.` : "Others are discarding...";
    }
    case "robberMove": return game.currentPlayerIndex === 0 ? "Move the robber." : `${cur} is moving the robber...`;
    case "robberSteal": return game.currentPlayerIndex === 0 ? "Choose who to steal from." : `${cur} is stealing...`;
    case "actions": return game.currentPlayerIndex === 0 ? "Your turn - build, trade, or end turn." : `${cur}'s turn...`;
    default: return "";
  }
}

function renderHud(game) {
  const dice = game.dice[0] > 0 ? `🎲 ${game.dice[0]} + ${game.dice[1]} = ${game.dice[0] + game.dice[1]}` : "";
  el("hud-status").innerHTML = `
    <div class="turn-banner">${esc(turnBannerText(game))}</div>
    ${dice ? `<div class="dice-display">${dice}</div>` : ""}
  `;
}

// ---------- action bar ----------

function renderActionBar(game, uiState, handlers) {
  const bar = el("action-bar");
  const humanTurn = game.phase === "playing" && game.currentPlayerIndex === 0 && game.turnPhase === "actions";
  const you = game.players[0];

  if (game.phase !== "playing" || !humanTurn) {
    bar.innerHTML = game.phase === "playing" && game.currentPlayerIndex === 0 && game.turnPhase === "preRoll"
      ? `<button id="roll-btn">Roll Dice</button>`
      : "";
    if (el("roll-btn")) el("roll-btn").addEventListener("click", handlers.onRollDice);
    return;
  }

  const modeBtn = (mode, label, cost) => {
    const active = uiState.mode === mode;
    const afford = !cost || Object.entries(cost).every(([r, a]) => you.resources[r] >= a);
    return `<button class="build-btn${active ? " active" : ""}" data-mode="${mode}" ${afford ? "" : "disabled"}>${label}</button>`;
  };

  bar.innerHTML = `
    ${modeBtn("road", "Build Road", BUILD_COSTS.road)}
    ${modeBtn("settlement", "Build Settlement", BUILD_COSTS.settlement)}
    ${modeBtn("city", "Build City", BUILD_COSTS.city)}
    <button id="buy-dev-btn" ${game.devCardDeck.length === 0 || !Object.entries(BUILD_COSTS.devCard).every(([r, a]) => you.resources[r] >= a) ? "disabled" : ""}>Buy Dev Card (${game.devCardDeck.length} left)</button>
    <button id="trade-btn">Trade</button>
    ${uiState.mode ? `<button id="cancel-mode-btn">Cancel</button>` : ""}
    ${uiState.mode === "roadBuilding" ? `<button id="confirm-road-building-btn">Done placing roads</button>` : ""}
    <button id="end-turn-btn">End Turn</button>
  `;

  bar.querySelectorAll(".build-btn").forEach((btn) => {
    btn.addEventListener("click", () => handlers.onSetMode(btn.dataset.mode));
  });
  if (el("buy-dev-btn")) el("buy-dev-btn").addEventListener("click", handlers.onBuyDevCard);
  if (el("trade-btn")) el("trade-btn").addEventListener("click", handlers.onOpenTrade);
  if (el("cancel-mode-btn")) el("cancel-mode-btn").addEventListener("click", handlers.onCancelMode);
  if (el("confirm-road-building-btn")) el("confirm-road-building-btn").addEventListener("click", handlers.onConfirmRoadBuilding);
  if (el("end-turn-btn")) el("end-turn-btn").addEventListener("click", handlers.onEndTurn);
}

// ---------- dev card panel ----------

function renderDevCardPanel(game, handlers) {
  const panel = el("dev-card-panel");
  const you = game.players[0];
  const humanActions = game.phase === "playing" && game.currentPlayerIndex === 0 && game.turnPhase === "actions";

  if (you.devCards.length === 0) { panel.innerHTML = `<div class="dev-card-empty">No development cards</div>`; return; }

  panel.innerHTML = `<div class="dev-card-list">${you.devCards.map((card, idx) => {
    const playable = humanActions && !game.devCardPlayedThisTurn && card.type !== "victoryPoint" && card.boughtTurn !== game.turnNumber;
    return `
      <div class="dev-card">
        <span class="dev-card-name">${DEV_CARD_LABELS[card.type]}</span>
        ${playable ? `<button class="play-dev-btn" data-idx="${idx}" data-type="${card.type}">Play</button>` : ""}
      </div>
    `;
  }).join("")}</div>`;

  panel.querySelectorAll(".play-dev-btn").forEach((btn) => {
    btn.addEventListener("click", () => handlers.onPlayDevCard(Number(btn.dataset.idx), btn.dataset.type));
  });
}

// ---------- player panels ----------

function renderPlayerPanels(game) {
  el("player-panels").innerHTML = game.players.map((p) => {
    const vp = p.isHuman ? totalVictoryPoints(game, p.id) : publicVictoryPoints(game, p.id);
    const resourceLine = p.isHuman
      ? RESOURCE_LIST.map((r) => `${p.resources[r]} ${RESOURCE_ABBR[r]}`).join(" · ")
      : `${RESOURCE_LIST.reduce((s, r) => s + p.resources[r], 0)} cards`;
    const badges = [];
    if (game.longestRoadOwner === p.id) badges.push(`<span class="badge">Longest Road</span>`);
    if (game.largestArmyOwner === p.id) badges.push(`<span class="badge">Largest Army</span>`);
    const active = game.phase === "playing" ? game.currentPlayerIndex === p.id : game.currentSetupPlayerIdx() === p.id;
    return `
      <div class="player-panel${active ? " active-player" : ""}" style="--pcolor:${p.color}">
        <div class="player-panel-head">
          <span class="player-swatch"></span>
          <span class="player-name">${esc(p.name)}</span>
          <span class="player-vp">${vp} VP</span>
        </div>
        <div class="player-panel-resources">${resourceLine}</div>
        <div class="player-panel-meta">${p.devCards.length} dev cards · roads ${15 - p.piecesLeft.road} · ${badges.join(" ")}</div>
      </div>
    `;
  }).join("");
}

function renderLog(game) {
  const logEl = el("game-log");
  logEl.innerHTML = game.log.slice(-40).map((line) => `<div class="log-line">${esc(line)}</div>`).join("");
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------- modals ----------

function renderDiscardModal(game, uiState, handlers) {
  const modal = el("discard-modal");
  const entry = game.turnPhase === "discard" ? game.pendingDiscards.find((d) => d.playerIdx === 0) : null;
  if (!entry) { modal.classList.add("hidden"); return; }
  modal.classList.remove("hidden");

  const you = game.players[0];
  el("discard-required").textContent = entry.count;
  const box = el("discard-inputs");
  if (!box.dataset.built) {
    box.innerHTML = RESOURCE_LIST.map((r) => `
      <label>${RESOURCE_LABELS[r]}
        <input type="number" min="0" max="${you.resources[r]}" value="0" data-res="${r}" class="discard-input">
      </label>
    `).join("");
    box.dataset.built = "1";
  }

  const readCounts = () => {
    const counts = {};
    box.querySelectorAll(".discard-input").forEach((input) => { counts[input.dataset.res] = Number(input.value) || 0; });
    return counts;
  };
  const updateSum = () => {
    const sum = Object.values(readCounts()).reduce((a, b) => a + b, 0);
    el("discard-sum").textContent = sum;
    el("discard-confirm-btn").disabled = sum !== entry.count;
  };
  box.querySelectorAll(".discard-input").forEach((input) => input.oninput = updateSum);
  updateSum();

  el("discard-confirm-btn").onclick = () => { handlers.onDiscard(readCounts()); box.dataset.built = ""; };
}

function renderStealModal(game, handlers) {
  const modal = el("steal-modal");
  if (game.turnPhase !== "robberSteal" || game.currentPlayerIndex !== 0 || !game.pendingSteal) { modal.classList.add("hidden"); return; }
  modal.classList.remove("hidden");
  el("steal-options").innerHTML = game.pendingSteal.victimOptions.map((idx) => `<button class="steal-option-btn" data-idx="${idx}">${esc(game.nameFor(idx))}</button>`).join("");
  el("steal-options").querySelectorAll(".steal-option-btn").forEach((btn) => {
    btn.addEventListener("click", () => handlers.onStealVictim(Number(btn.dataset.idx)));
  });
}

function renderDevCardPickerModal(game, uiState, handlers) {
  const modal = el("devcard-picker-modal");
  const picker = uiState.devCardPicker;
  if (!picker) { modal.classList.add("hidden"); return; }
  modal.classList.remove("hidden");

  const needed = picker.type === "monopoly" ? 1 : 2;
  el("devcard-picker-title").textContent = picker.type === "monopoly" ? "Monopoly - name a resource" : "Year of Plenty - pick 2 resources";
  el("devcard-picker-options").innerHTML = RESOURCE_LIST.map((r) => `<button class="resource-pick-btn" data-res="${r}">${RESOURCE_LABELS[r]}</button>`).join("");
  el("devcard-picker-picks").textContent = picker.picks.map((r) => RESOURCE_LABELS[r]).join(", ") || "(none picked)";
  el("devcard-picker-confirm-btn").disabled = picker.picks.length !== needed;

  el("devcard-picker-options").querySelectorAll(".resource-pick-btn").forEach((btn) => {
    btn.addEventListener("click", () => handlers.onDevCardPick(btn.dataset.res));
  });
  el("devcard-picker-confirm-btn").onclick = handlers.onConfirmDevCardPicker;
  el("devcard-picker-cancel-btn").onclick = handlers.onCancelDevCardPicker;
}

function renderBotTradeModal(game, handlers) {
  const modal = el("bot-trade-modal");
  const offer = game.pendingBotTradeOffer;
  if (!offer) { modal.classList.add("hidden"); return; }
  modal.classList.remove("hidden");
  const listStr = (obj) => Object.entries(obj).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${RESOURCE_LABELS[r]}`).join(", ");
  el("bot-trade-text").textContent = `${game.nameFor(offer.fromIdx)} offers you ${listStr(offer.give)} for ${listStr(offer.want)}.`;
  el("bot-trade-accept-btn").onclick = () => handlers.onRespondBotTrade(true);
  el("bot-trade-reject-btn").onclick = () => handlers.onRespondBotTrade(false);
}

function renderTradeModal(game, uiState, handlers) {
  const modal = el("trade-modal");
  if (!uiState.tradeOpen) { modal.classList.add("hidden"); return; }
  modal.classList.remove("hidden");
  const you = game.players[0];

  el("trade-bank-tab-btn").classList.toggle("active", uiState.tradeTab === "bank");
  el("trade-players-tab-btn").classList.toggle("active", uiState.tradeTab === "players");
  el("trade-bank-panel").classList.toggle("hidden", uiState.tradeTab !== "bank");
  el("trade-players-panel").classList.toggle("hidden", uiState.tradeTab !== "players");
  el("trade-bank-tab-btn").onclick = () => handlers.onSetTradeTab("bank");
  el("trade-players-tab-btn").onclick = () => handlers.onSetTradeTab("players");

  const giveOptions = RESOURCE_LIST.map((r) => {
    const rate = bestTradeRate(game.board, 0, r);
    return `<option value="${r}" ${uiState.bankDraft.give === r ? "selected" : ""}>${RESOURCE_LABELS[r]} (${rate}:1, have ${you.resources[r]})</option>`;
  }).join("");
  const wantOptions = RESOURCE_LIST.map((r) => `<option value="${r}" ${uiState.bankDraft.want === r ? "selected" : ""}>${RESOURCE_LABELS[r]}</option>`).join("");
  el("trade-bank-panel").innerHTML = `
    <label>Give <select id="bank-give-select">${giveOptions}</select></label>
    <label>Receive 1 <select id="bank-want-select">${wantOptions}</select></label>
    <button id="bank-trade-confirm-btn">Trade</button>
  `;
  el("bank-give-select").onchange = (e) => handlers.onBankDraftChange({ give: e.target.value });
  el("bank-want-select").onchange = (e) => handlers.onBankDraftChange({ want: e.target.value });
  el("bank-trade-confirm-btn").onclick = handlers.onBankTradeConfirm;

  el("trade-players-panel").innerHTML = `
    <div class="trade-columns">
      <div class="trade-col">
        <div class="zone-label">You Give</div>
        ${RESOURCE_LIST.map((r) => `<label>${RESOURCE_LABELS[r]} <input type="number" min="0" max="${you.resources[r]}" value="${uiState.playerDraft.give[r] || 0}" data-side="give" data-res="${r}" class="trade-qty"></label>`).join("")}
      </div>
      <div class="trade-col">
        <div class="zone-label">You Want</div>
        ${RESOURCE_LIST.map((r) => `<label>${RESOURCE_LABELS[r]} <input type="number" min="0" value="${uiState.playerDraft.want[r] || 0}" data-side="want" data-res="${r}" class="trade-qty"></label>`).join("")}
      </div>
    </div>
    <button id="propose-trade-btn">Propose to Opponents</button>
  `;
  el("trade-players-panel").querySelectorAll(".trade-qty").forEach((input) => {
    input.oninput = () => handlers.onPlayerDraftChange(input.dataset.side, input.dataset.res, Number(input.value) || 0);
  });
  el("propose-trade-btn").onclick = handlers.onProposeTrade;

  el("trade-close-btn").onclick = handlers.onCloseTrade;
}

function renderGameOverModal(game, handlers) {
  const modal = el("game-over-modal");
  if (game.phase !== "gameOver") { modal.classList.add("hidden"); return; }
  modal.classList.remove("hidden");
  const standings = game.standings();
  el("final-standings").innerHTML = standings.map((p, i) => `
    <div class="standing-row${p.id === game.winner ? " winner-row" : ""}">
      <span>${i + 1}. ${esc(p.name)}</span><span>${totalVictoryPoints(game, p.id)} VP</span>
    </div>
  `).join("");
  el("play-again-btn").onclick = handlers.onPlayAgain;
}

// ---------- entry point ----------

export function renderAll(game, uiState, handlers) {
  el("board-wrap").innerHTML = renderBoardSvg(game, uiState);
  const svg = el("board-svg");
  svg.querySelectorAll("[data-node-id]").forEach((n) => n.addEventListener("click", () => handlers.onNodeClick(Number(n.dataset.nodeId))));
  svg.querySelectorAll("[data-edge-id]").forEach((n) => n.addEventListener("click", () => handlers.onEdgeClick(Number(n.dataset.edgeId))));
  svg.querySelectorAll("[data-hex-id]").forEach((n) => n.addEventListener("click", () => handlers.onHexClick(Number(n.dataset.hexId))));

  renderHud(game);
  renderActionBar(game, uiState, handlers);
  renderDevCardPanel(game, handlers);
  renderPlayerPanels(game);
  renderLog(game);

  renderDiscardModal(game, uiState, handlers);
  renderStealModal(game, handlers);
  renderDevCardPickerModal(game, uiState, handlers);
  renderBotTradeModal(game, handlers);
  renderTradeModal(game, uiState, handlers);
  renderGameOverModal(game, handlers);
}

export function showRules() { el("rules-modal").classList.remove("hidden"); }
export function hideRules() { el("rules-modal").classList.add("hidden"); }
