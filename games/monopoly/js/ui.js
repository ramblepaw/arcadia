import { SPACES, spaceAt, GROUP_COLORS, gridPosition, edgeOf, ordinal, JAIL_FINE } from "./board-data.js";
import {
  ownedSpaceIds, canBuildHouse, canSellHouse, canMortgage, canUnmortgage,
  mortgageValueOf, unmortgageCostOf, liquidationSteps,
} from "./rules.js";

const PLAYER_COLORS = ["#e8c14a", "#3d6fb5", "#c0392b", "#2e9e5b", "#a06bf0", "#e07b39"];

let manageModalOpen = false;
let tradeModalOpen = false;
let tradeDraft = { toIdx: null, offerPropertyIds: new Set(), offerCash: 0, requestPropertyIds: new Set(), requestCash: 0, error: "" };

export function openManageModal() { manageModalOpen = true; }
export function closeManageModal() { manageModalOpen = false; }
export function openTradeModal() {
  tradeModalOpen = true;
  tradeDraft = { toIdx: null, offerPropertyIds: new Set(), offerCash: 0, requestPropertyIds: new Set(), requestCash: 0, error: "" };
}
export function closeTradeModal() { tradeModalOpen = false; }
export function setTradeError(msg) { tradeDraft.error = msg; }

function mkBtn(label, onClick, variant) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.className = variant ? `btn ${variant}` : "btn";
  btn.addEventListener("click", onClick);
  return btn;
}

// ---------- board ----------

function buildSpaceCell(game, space) {
  const pos = gridPosition(space.id);
  const edge = edgeOf(space.id);
  const cell = document.createElement("div");
  cell.className = `space space-${space.type}`;
  cell.style.gridRow = String(pos.row);
  cell.style.gridColumn = String(pos.col);

  // Everything but the owner/mortgage badges and player tokens lives inside a
  // rotated wrapper, so the color band always faces the board's outer edge
  // and the name/price read correctly from that side of the table - matching
  // a real board instead of every space just facing "up".
  const content = document.createElement("div");
  content.className = `space-content edge-${edge}`;

  if (space.type === "property") {
    const bar = document.createElement("div");
    bar.className = "color-bar";
    bar.style.background = GROUP_COLORS[space.group];
    content.appendChild(bar);
  }

  const name = document.createElement("div");
  name.className = "space-name";
  name.textContent = space.name;
  content.appendChild(name);

  if (space.type === "property" || space.type === "railroad" || space.type === "utility") {
    const prop = game.properties[space.id];
    if (space.type === "property" && (prop.houses > 0 || prop.hotel)) {
      const houses = document.createElement("div");
      houses.className = "house-row";
      houses.textContent = prop.hotel ? "⭐" : "⬛".repeat(prop.houses);
      content.appendChild(houses);
    }
    const priceEl = document.createElement("div");
    priceEl.className = "space-price";
    priceEl.textContent = space.price ? `$${space.price}` : "";
    content.appendChild(priceEl);
  }
  cell.appendChild(content);

  if (space.type === "property" || space.type === "railroad" || space.type === "utility") {
    const prop = game.properties[space.id];
    if (prop.ownerId !== null) {
      const ownerBadge = document.createElement("div");
      ownerBadge.className = "owner-badge";
      ownerBadge.style.background = PLAYER_COLORS[prop.ownerId];
      cell.appendChild(ownerBadge);
      if (prop.mortgaged) {
        const m = document.createElement("div");
        m.className = "mortgaged-badge";
        m.textContent = "M";
        cell.appendChild(m);
      }
    }
  }

  const tokenRow = document.createElement("div");
  tokenRow.className = "token-row";
  game.players.forEach((p, idx) => {
    if (p.bankrupt || p.position !== space.id) return;
    const token = document.createElement("div");
    token.className = "token";
    token.style.background = PLAYER_COLORS[idx];
    token.title = p.name;
    tokenRow.appendChild(token);
  });
  cell.appendChild(tokenRow);

  return cell;
}

function statusText(game) {
  if (game.isGameOver) return "Game over.";
  if (game.mustRaiseCash) return `${game.nameFor(game.mustRaiseCash.playerIdx)} must raise $${game.mustRaiseCash.amountOwed}.`;
  if (game.auction) {
    const bidder = game.auction.highBidderIdx;
    return `Auction: ${spaceAt(game.auction.spaceId).name} — high bid $${game.auction.highBid}${bidder !== null ? ` (${game.nameFor(bidder)})` : ""}.`;
  }
  if (game.pendingTrade) return `${game.nameFor(game.pendingTrade.fromIdx)} proposed a trade to ${game.nameFor(game.pendingTrade.toIdx)}...`;
  if (game.pendingCard) return `${game.nameFor(game.currentPlayerIndex)} drew a ${game.pendingCard.deckType === "chance" ? "Chance" : "Community Chest"} card.`;

  const p = game.currentPlayer;
  if (game.turnPhase === "jailDecision") return `${p.name} ${p.isHuman ? "are" : "is"} in Jail — pay, use a card, or roll for doubles.`;
  if (game.turnPhase === "rollDice") return p.isHuman ? "Your turn — roll the dice." : `${p.name} is rolling...`;
  if (game.turnPhase === "buyDecision") return `${p.name} landed on ${spaceAt(game.pendingBuySpaceId).name}.`;
  if (game.turnPhase === "postRollActions") return p.isHuman ? "Manage your properties, then end your turn." : `${p.name} is finishing up...`;
  return "";
}

function buildActionRow(game, handlers) {
  const row = document.createElement("div");
  row.className = "action-row";
  if (game.isGameOver) return row;
  if (game.mustRaiseCash || game.auction || game.pendingTrade || game.pendingCard) return row;
  if (game.currentPlayerIndex !== 0) return row;

  if (game.turnPhase === "jailDecision") {
    const player = game.players[0];
    row.appendChild(mkBtn(`Pay $${JAIL_FINE}`, () => handlers.onJailAction("pay")));
    if (player.jailFreeCards.length > 0) row.appendChild(mkBtn("Use Jail Card", () => handlers.onJailAction("useCard")));
    row.appendChild(mkBtn("Roll for Doubles", () => handlers.onJailAction("roll")));
    return row;
  }

  if (game.turnPhase === "rollDice") {
    row.appendChild(mkBtn("Roll Dice", () => handlers.onRollDice(), "primary"));
    return row;
  }

  if (game.turnPhase === "buyDecision") {
    const space = spaceAt(game.pendingBuySpaceId);
    const buyBtn = mkBtn(`Buy for $${space.price}`, () => handlers.onBuy(), "primary");
    if (game.players[0].cash < space.price) buyBtn.disabled = true;
    row.appendChild(buyBtn);
    row.appendChild(mkBtn("Decline (Auction)", () => handlers.onDecline(), "secondary"));
    return row;
  }

  if (game.turnPhase === "postRollActions") {
    row.appendChild(mkBtn("Manage Properties", () => handlers.onOpenManage()));
    row.appendChild(mkBtn("Propose Trade", () => handlers.onOpenTrade()));
    row.appendChild(mkBtn("End Turn", () => handlers.onEndTurn(), "primary"));
    return row;
  }

  return row;
}

function buildCenterPanel(game, handlers) {
  const center = document.createElement("div");
  center.className = "board-center";
  center.style.gridRow = "2 / 11";
  center.style.gridColumn = "2 / 11";

  const status = document.createElement("div");
  status.className = "status-text";
  status.textContent = statusText(game);
  center.appendChild(status);

  const diceEl = document.createElement("div");
  diceEl.className = "dice-row";
  diceEl.innerHTML = `<span class="die">${game.dice[0] || "-"}</span><span class="die">${game.dice[1] || "-"}</span>`;
  center.appendChild(diceEl);

  center.appendChild(buildActionRow(game, handlers));

  const log = document.createElement("div");
  log.className = "game-log";
  const recent = game.log.slice(-8);
  recent.forEach((line, i) => {
    const div = document.createElement("div");
    div.className = "log-line" + (i === recent.length - 1 ? " latest" : "");
    div.textContent = line;
    log.appendChild(div);
  });
  center.appendChild(log);

  return center;
}

function renderBoard(game, handlers) {
  const wrap = document.getElementById("board-grid");
  wrap.innerHTML = "";
  SPACES.forEach((space) => wrap.appendChild(buildSpaceCell(game, space)));
  wrap.appendChild(buildCenterPanel(game, handlers));
}

// ---------- player panels ----------

function renderPlayerPanels(game) {
  const wrap = document.getElementById("player-panels");
  wrap.innerHTML = "";
  game.players.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "player-panel";
    if (idx === game.currentPlayerIndex && !game.isGameOver) card.classList.add("active-turn");
    if (p.bankrupt) card.classList.add("bankrupt");

    const header = document.createElement("div");
    header.className = "panel-header";
    const dot = document.createElement("span");
    dot.className = "player-dot";
    dot.style.background = PLAYER_COLORS[idx];
    header.appendChild(dot);
    const name = document.createElement("span");
    name.className = "panel-name";
    name.textContent = p.name;
    header.appendChild(name);
    card.appendChild(header);

    const cash = document.createElement("div");
    cash.className = "panel-cash";
    cash.textContent = p.bankrupt ? "Bankrupt" : `$${p.cash}`;
    card.appendChild(cash);

    if (!p.bankrupt) {
      const props = ownedSpaceIds(game, idx);
      const propCount = document.createElement("div");
      propCount.className = "panel-props";
      propCount.textContent = `${props.length} propert${props.length === 1 ? "y" : "ies"}`;
      card.appendChild(propCount);

      if (p.inJail) {
        const jail = document.createElement("div");
        jail.className = "panel-jail";
        jail.textContent = "In Jail";
        card.appendChild(jail);
      }
    }

    wrap.appendChild(card);
  });
}

// ---------- modals ----------

function renderCardModal(game, handlers) {
  const modal = document.getElementById("card-modal");
  if (!game.pendingCard) { modal.classList.add("hidden"); return; }
  modal.classList.remove("hidden");
  document.getElementById("card-deck-label").textContent = game.pendingCard.deckType === "chance" ? "Chance" : "Community Chest";
  document.getElementById("card-text").textContent = game.pendingCard.card.text;
  const btn = document.getElementById("card-ok-btn");
  btn.classList.toggle("hidden", game.currentPlayerIndex !== 0);
  btn.onclick = () => handlers.onAcknowledgeCard();
}

function renderAuctionModal(game, handlers) {
  const modal = document.getElementById("auction-modal");
  const shouldShow = !!game.auction && game.nextAuctionBidder() === 0;
  modal.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) return;

  const space = spaceAt(game.auction.spaceId);
  document.getElementById("auction-property-name").textContent = space.name;
  document.getElementById("auction-high-bid").textContent =
    game.auction.highBid > 0 ? `$${game.auction.highBid} (${game.nameFor(game.auction.highBidderIdx)})` : "No bids yet";

  const input = document.getElementById("auction-bid-input");
  const minBid = game.auction.highBid + 10;
  input.min = String(minBid);
  if (!input.value || Number(input.value) < minBid) input.value = String(minBid);

  document.getElementById("auction-bid-btn").onclick = () => {
    const amount = parseInt(input.value, 10);
    if (amount) handlers.onPlaceBid(amount);
  };
  document.getElementById("auction-pass-btn").onclick = () => handlers.onPassAuction();
}

function renderManageModal(game, handlers) {
  const modal = document.getElementById("manage-modal");
  const shouldShow = manageModalOpen && game.turnPhase === "postRollActions" && game.currentPlayerIndex === 0 && !game.mustRaiseCash;
  modal.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) return;

  const wrap = document.getElementById("manage-list");
  wrap.innerHTML = "";
  const owned = ownedSpaceIds(game, 0).sort((a, b) => a - b);
  if (owned.length === 0) {
    wrap.innerHTML = "<p class=\"muted\">You don't own any properties yet.</p>";
  }
  owned.forEach((spaceId) => {
    const space = spaceAt(spaceId);
    const prop = game.properties[spaceId];
    const row = document.createElement("div");
    row.className = "manage-row";

    const label = document.createElement("div");
    label.className = "manage-label";
    const buildingNote = prop.hotel ? " — hotel" : prop.houses > 0 ? ` — ${prop.houses} house(s)` : "";
    label.textContent = `${space.name}${prop.mortgaged ? " (mortgaged)" : ""}${buildingNote}`;
    row.appendChild(label);

    const btns = document.createElement("div");
    btns.className = "manage-btns";

    if (space.type === "property") {
      const buildBtn = mkBtn("+House", () => handlers.onBuildHouse(spaceId));
      buildBtn.disabled = !canBuildHouse(game, 0, spaceId);
      btns.appendChild(buildBtn);

      const sellBtn = mkBtn("-House", () => handlers.onSellHouse(spaceId));
      sellBtn.disabled = !canSellHouse(game, 0, spaceId);
      btns.appendChild(sellBtn);
    }

    if (prop.mortgaged) {
      const unmortBtn = mkBtn(`Unmortgage ($${unmortgageCostOf(spaceId)})`, () => handlers.onUnmortgage(spaceId));
      unmortBtn.disabled = !canUnmortgage(game, 0, spaceId);
      btns.appendChild(unmortBtn);
    } else {
      const mortBtn = mkBtn(`Mortgage ($${mortgageValueOf(spaceId)})`, () => handlers.onMortgage(spaceId));
      mortBtn.disabled = !canMortgage(game, 0, spaceId);
      btns.appendChild(mortBtn);
    }

    row.appendChild(btns);
    wrap.appendChild(row);
  });

  document.getElementById("manage-close-btn").onclick = () => handlers.onCloseManage();
}

function buildTradeCheckbox(spaceId, set, handlers) {
  const space = spaceAt(spaceId);
  const label = document.createElement("label");
  label.className = "trade-check";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = set.has(spaceId);
  cb.addEventListener("change", () => {
    if (cb.checked) set.add(spaceId); else set.delete(spaceId);
    handlers.onRerender();
  });
  label.appendChild(cb);
  label.append(` ${space.name}`);
  return label;
}

function renderTradeModal(game, handlers) {
  const modal = document.getElementById("trade-modal");
  const shouldShow = tradeModalOpen && game.turnPhase === "postRollActions" && game.currentPlayerIndex === 0 && !game.mustRaiseCash;
  modal.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) return;

  const otherPlayers = game.players.map((p, i) => ({ p, i })).filter(({ p, i }) => i !== 0 && !p.bankrupt);
  if (tradeDraft.toIdx === null && otherPlayers.length > 0) tradeDraft.toIdx = otherPlayers[0].i;

  const select = document.getElementById("trade-target-select");
  select.innerHTML = "";
  otherPlayers.forEach(({ p, i }) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = p.name;
    if (i === tradeDraft.toIdx) opt.selected = true;
    select.appendChild(opt);
  });
  select.onchange = () => {
    tradeDraft.toIdx = parseInt(select.value, 10);
    tradeDraft.requestPropertyIds.clear();
    handlers.onRerender();
  };

  const offerList = document.getElementById("trade-offer-list");
  offerList.innerHTML = "";
  ownedSpaceIds(game, 0).forEach((spaceId) => {
    const prop = game.properties[spaceId];
    if (prop.houses > 0 || prop.hotel) return;
    offerList.appendChild(buildTradeCheckbox(spaceId, tradeDraft.offerPropertyIds, handlers));
  });

  const requestList = document.getElementById("trade-request-list");
  requestList.innerHTML = "";
  if (tradeDraft.toIdx !== null) {
    ownedSpaceIds(game, tradeDraft.toIdx).forEach((spaceId) => {
      const prop = game.properties[spaceId];
      if (prop.houses > 0 || prop.hotel) return;
      requestList.appendChild(buildTradeCheckbox(spaceId, tradeDraft.requestPropertyIds, handlers));
    });
  }

  const offerCashInput = document.getElementById("trade-offer-cash");
  offerCashInput.max = String(game.players[0].cash);
  offerCashInput.value = String(tradeDraft.offerCash);
  offerCashInput.onchange = () => { tradeDraft.offerCash = Math.max(0, parseInt(offerCashInput.value, 10) || 0); };

  const requestCashInput = document.getElementById("trade-request-cash");
  requestCashInput.max = String(tradeDraft.toIdx !== null ? game.players[tradeDraft.toIdx].cash : 0);
  requestCashInput.value = String(tradeDraft.requestCash);
  requestCashInput.onchange = () => { tradeDraft.requestCash = Math.max(0, parseInt(requestCashInput.value, 10) || 0); };

  document.getElementById("trade-propose-btn").onclick = () => {
    handlers.onProposeTrade({
      toIdx: tradeDraft.toIdx,
      offer: { cash: tradeDraft.offerCash, propertyIds: [...tradeDraft.offerPropertyIds] },
      request: { cash: tradeDraft.requestCash, propertyIds: [...tradeDraft.requestPropertyIds] },
    });
  };
  document.getElementById("trade-close-btn").onclick = () => handlers.onCloseTrade();

  document.getElementById("trade-error").textContent = tradeDraft.error || "";
}

function renderRaiseCashModal(game, handlers) {
  const modal = document.getElementById("raise-cash-modal");
  const shouldShow = !!game.mustRaiseCash && game.mustRaiseCash.playerIdx === 0;
  modal.classList.toggle("hidden", !shouldShow);
  if (!shouldShow) return;

  const crisis = game.mustRaiseCash;
  document.getElementById("raise-cash-info").textContent =
    `You owe $${crisis.amountOwed} (${crisis.reason}) but only have $${game.players[0].cash}. Raise cash or declare bankruptcy.`;

  const wrap = document.getElementById("raise-cash-list");
  wrap.innerHTML = "";
  const steps = liquidationSteps(game, 0);
  if (steps.length === 0) {
    wrap.innerHTML = "<p class=\"muted\">Nothing left to sell or mortgage.</p>";
  }
  steps.forEach((step) => {
    const row = document.createElement("div");
    row.className = "manage-row";
    const space = spaceAt(step.spaceId);
    const label = document.createElement("div");
    label.textContent = `${step.type === "sellHouse" ? "Sell a house on" : "Mortgage"} ${space.name} (+$${step.amount})`;
    row.appendChild(label);
    row.appendChild(mkBtn("Do It", () => handlers.onLiquidate(step)));
    wrap.appendChild(row);
  });

  document.getElementById("raise-cash-bankrupt-btn").onclick = () => handlers.onDeclareBankruptcy();
}

// ---------- top-level ----------

export function renderAll(game, handlers) {
  renderBoard(game, handlers);
  renderPlayerPanels(game);
  renderCardModal(game, handlers);
  renderAuctionModal(game, handlers);
  renderManageModal(game, handlers);
  renderTradeModal(game, handlers);
  renderRaiseCashModal(game, handlers);
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
