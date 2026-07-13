import {
  SPACES, spaceAt, RAILROADS, UTILITIES, GO_SALARY, JAIL_FINE, JAIL_SPACE_ID,
  MAX_JAIL_TURNS, STARTING_CASH, BOARD_SIZE, HOUSE_SUPPLY, HOTEL_SUPPLY,
} from "./board-data.js";
import { CHANCE_CARDS, CHEST_CARDS, newDeckState, drawCard, discardCard } from "./cards.js";
import {
  ownedSpaceIds, computeRent, canBuildHouse, canSellHouse,
  canMortgage, canUnmortgage, mortgageValueOf, unmortgageCostOf, validateTrade,
} from "./rules.js";

const BOT_NAMES = [
  "Ada", "Beau", "Casey", "Dana", "Ezra", "Finch", "Gwen", "Huxley",
  "Ivy", "Jules", "Kira", "Lennon", "Marlowe", "Nico", "Orin", "Piper",
];

function pickBotNames(count) {
  const pool = [...BOT_NAMES];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function makePlayer(id, name, isHuman) {
  return {
    id, name, isHuman,
    position: 0,
    cash: STARTING_CASH,
    inJail: false,
    jailTurns: 0,
    jailFreeCards: [],
    doublesStreak: 0,
    bankrupt: false,
    finishRank: null,
  };
}

export class Game {
  constructor(numBots) {
    this.numPlayers = numBots + 1;
    this.players = [makePlayer(0, "You", true)];
    const botNames = pickBotNames(numBots);
    for (let i = 1; i <= numBots; i++) this.players.push(makePlayer(i, botNames[i - 1], false));

    this.properties = {};
    for (const space of SPACES) {
      if (space.type === "property" || space.type === "railroad" || space.type === "utility") {
        this.properties[space.id] = { ownerId: null, houses: 0, hotel: false, mortgaged: false };
      }
    }
    this.bank = { housesLeft: HOUSE_SUPPLY, hotelsLeft: HOTEL_SUPPLY };
    this.chance = newDeckState(CHANCE_CARDS);
    this.chest = newDeckState(CHEST_CARDS);

    this.currentPlayerIndex = Math.floor(Math.random() * this.numPlayers);
    this.turnPhase = "rollDice"; // jailDecision | rollDice | buyDecision | auction | cardModal | postRollActions | gameOver
    this.dice = [0, 0];
    this.rolledDoublesThisTurn = false;
    this.auction = null; // { spaceId, highBid, highBidderIdx, order, passed, turnPtr }
    this.pendingTrade = null; // { fromIdx, toIdx, offerCash, offerPropertyIds, requestCash, requestPropertyIds }
    this.mustRaiseCash = null; // { playerIdx, amountOwed, creditorIdx, reason, distributeTo? }
    this.pendingCard = null; // { deckType, card }
    this.pendingBuySpaceId = null;
    this.bankruptOrder = [];
    this.gameOver = false;

    this.log = [];
    this.listeners = [];

    const starter = this.players[this.currentPlayerIndex];
    this.pushLog(`${starter.name} went first.`);
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  pushLog(text) {
    this.log.push(text);
    if (this.log.length > 60) this.log.shift();
  }

  nameFor(idx) {
    return this.players[idx].name;
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  get isGameOver() {
    return this.gameOver;
  }

  nextActiveIndex(fromIdx) {
    const n = this.numPlayers;
    for (let step = 1; step <= n; step++) {
      const idx = (fromIdx + step) % n;
      if (!this.players[idx].bankrupt) return idx;
    }
    return fromIdx;
  }

  standings() {
    return this.players.slice().sort((a, b) => (a.finishRank ?? 999) - (b.finishRank ?? 999));
  }

  // ---------- movement ----------

  grantGoSalary(playerIdx) {
    this.players[playerIdx].cash += GO_SALARY;
    this.pushLog(`${this.nameFor(playerIdx)} passed GO and collected $${GO_SALARY}.`);
  }

  movePlayerBy(playerIdx, steps) {
    const player = this.players[playerIdx];
    const oldPos = player.position;
    const newPos = ((oldPos + steps) % BOARD_SIZE + BOARD_SIZE) % BOARD_SIZE;
    if (steps > 0 && newPos < oldPos) this.grantGoSalary(playerIdx);
    player.position = newPos;
  }

  movePlayerBackward(playerIdx, steps) {
    const player = this.players[playerIdx];
    player.position = ((player.position - steps) % BOARD_SIZE + BOARD_SIZE) % BOARD_SIZE;
  }

  movePlayerTo(playerIdx, targetPos) {
    const player = this.players[playerIdx];
    if (targetPos < player.position) this.grantGoSalary(playerIdx);
    player.position = targetPos;
  }

  nearestSpaceOfKind(fromPos, kind) {
    const list = kind === "railroad" ? RAILROADS : UTILITIES;
    const ahead = list.filter((id) => id > fromPos);
    return ahead.length > 0 ? ahead[0] : list[0];
  }

  sendToJail(playerIdx) {
    const player = this.players[playerIdx];
    player.inJail = true;
    player.position = JAIL_SPACE_ID;
    player.jailTurns = 0;
    player.doublesStreak = 0;
    this.pushLog(`${this.nameFor(playerIdx)} was sent to Jail.`);
  }

  // ---------- rolling & landing ----------

  rollDice(playerIdx) {
    if (this.turnPhase !== "rollDice" || playerIdx !== this.currentPlayerIndex) return false;
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    this.dice = [d1, d2];
    const isDoubles = d1 === d2;
    const player = this.players[playerIdx];
    this.pushLog(`${this.nameFor(playerIdx)} rolled ${d1}-${d2}${isDoubles ? " (doubles!)" : ""}.`);

    if (isDoubles) {
      player.doublesStreak += 1;
      if (player.doublesStreak >= 3) {
        player.doublesStreak = 0;
        this.pushLog(`${this.nameFor(playerIdx)} rolled 3 doubles in a row - straight to Jail!`);
        this.sendToJail(playerIdx);
        this.endTurn(playerIdx);
        return true;
      }
    } else {
      player.doublesStreak = 0;
    }

    this.rolledDoublesThisTurn = isDoubles;
    this.movePlayerBy(playerIdx, d1 + d2);
    this.resolveLanding(playerIdx);
    return true;
  }

  resolveLanding(playerIdx, opts = {}) {
    const player = this.players[playerIdx];
    const space = spaceAt(player.position);

    switch (space.type) {
      case "go":
      case "jail":
      case "freeParking": {
        this.turnPhase = "postRollActions";
        this.emit();
        break;
      }
      case "goToJail": {
        this.sendToJail(playerIdx);
        this.endTurn(playerIdx);
        break;
      }
      case "tax": {
        const paid = this.chargePlayer(playerIdx, space.amount, null, space.name);
        if (paid) this.turnPhase = "postRollActions";
        this.emit();
        break;
      }
      case "chance":
      case "chest": {
        this.drawAndApplyCard(playerIdx, space.type);
        break;
      }
      case "property":
      case "railroad":
      case "utility": {
        const prop = this.properties[player.position];
        if (prop.ownerId === null) {
          this.pendingBuySpaceId = player.position;
          this.turnPhase = "buyDecision";
          this.emit();
        } else if (prop.ownerId === playerIdx) {
          this.turnPhase = "postRollActions";
          this.emit();
        } else {
          const diceTotal = this.dice[0] + this.dice[1];
          const rent = computeRent(this, player.position, { diceTotal, rentMultiplier: opts.rentMultiplier });
          const paid = this.chargePlayer(playerIdx, rent, prop.ownerId, `rent on ${space.name}`);
          if (paid) this.turnPhase = "postRollActions";
          this.emit();
        }
        break;
      }
      default:
        this.turnPhase = "postRollActions";
        this.emit();
    }
  }

  // ---------- cash / bankruptcy ----------

  /** Deducts `amount` from playerIdx's cash, crediting creditorIdx (or the
   *  bank if null). If the player can't afford it, freezes the phase machine
   *  on `mustRaiseCash` instead of failing silently. Returns true on success. */
  chargePlayer(playerIdx, amount, creditorIdx, reason) {
    if (amount <= 0) return true;
    const player = this.players[playerIdx];
    if (player.cash >= amount) {
      player.cash -= amount;
      if (creditorIdx !== null) this.players[creditorIdx].cash += amount;
      this.pushLog(`${this.nameFor(playerIdx)} paid $${amount} (${reason}).`);
      return true;
    }
    this.mustRaiseCash = { playerIdx, amountOwed: amount, creditorIdx, reason };
    this.pushLog(`${this.nameFor(playerIdx)} can't cover $${amount} (${reason}) and must raise cash.`);
    return false;
  }

  chargeEachOtherPlayer(payerIdx, amount) {
    const others = this.players.filter((p, i) => i !== payerIdx && !p.bankrupt);
    const total = amount * others.length;
    const player = this.players[payerIdx];
    if (player.cash >= total) {
      player.cash -= total;
      others.forEach((p) => { p.cash += amount; });
      this.pushLog(`${this.nameFor(payerIdx)} paid $${amount} to each other player.`);
      return true;
    }
    this.mustRaiseCash = {
      playerIdx: payerIdx, amountOwed: total, creditorIdx: null,
      reason: "paying each player", distributeTo: others.map((p) => p.id),
    };
    return false;
  }

  collectFromEachOtherPlayer(collectorIdx, amount) {
    const collector = this.players[collectorIdx];
    let total = 0;
    this.players.forEach((p, i) => {
      if (i === collectorIdx || p.bankrupt) return;
      const paid = Math.min(amount, p.cash);
      p.cash -= paid;
      total += paid;
    });
    collector.cash += total;
    this.pushLog(`${this.nameFor(collectorIdx)} collected $${total} (from each other player).`);
  }

  countBuildings(playerIdx) {
    let houses = 0;
    let hotels = 0;
    for (const spaceId of ownedSpaceIds(this, playerIdx)) {
      const prop = this.properties[spaceId];
      if (prop.hotel) hotels += 1;
      else houses += prop.houses;
    }
    return { houses, hotels };
  }

  tryResolveCashCrisis() {
    const crisis = this.mustRaiseCash;
    if (!crisis) return;
    const player = this.players[crisis.playerIdx];
    if (player.cash >= crisis.amountOwed) {
      player.cash -= crisis.amountOwed;
      if (crisis.distributeTo) {
        const each = crisis.amountOwed / crisis.distributeTo.length;
        crisis.distributeTo.forEach((id) => { this.players[id].cash += each; });
      } else if (crisis.creditorIdx !== null) {
        this.players[crisis.creditorIdx].cash += crisis.amountOwed;
      }
      this.pushLog(`${this.nameFor(crisis.playerIdx)} raised enough cash and settled the debt.`);
      this.mustRaiseCash = null;
      this.turnPhase = "postRollActions";
    }
    this.emit();
  }

  liquidateAction(playerIdx, action) {
    if (!this.mustRaiseCash || this.mustRaiseCash.playerIdx !== playerIdx) return false;
    let amt = 0;
    if (action.type === "sellHouse") amt = this._sellHouseAsset(playerIdx, action.spaceId);
    else if (action.type === "mortgage") amt = this._mortgageAsset(playerIdx, action.spaceId);
    if (amt === 0) return false;
    this.tryResolveCashCrisis();
    return true;
  }

  declareBankruptcy(playerIdx) {
    if (!this.mustRaiseCash || this.mustRaiseCash.playerIdx !== playerIdx) return false;
    const creditorIdx = this.mustRaiseCash.creditorIdx;
    const player = this.players[playerIdx];

    for (const spaceId of ownedSpaceIds(this, playerIdx)) {
      const prop = this.properties[spaceId];
      if (prop.hotel) {
        this.bank.hotelsLeft += 1;
        prop.hotel = false;
      } else if (prop.houses > 0) {
        this.bank.housesLeft += prop.houses;
        prop.houses = 0;
      }
      if (creditorIdx !== null) {
        prop.ownerId = creditorIdx;
      } else {
        prop.ownerId = null;
        prop.mortgaged = false;
      }
    }
    if (creditorIdx !== null) this.players[creditorIdx].cash += player.cash;
    player.cash = 0;
    player.bankrupt = true;
    this.mustRaiseCash = null;
    this.bankruptOrder.push(playerIdx);
    this.pushLog(
      `${this.nameFor(playerIdx)} went bankrupt${creditorIdx !== null ? `, wiped out by ${this.nameFor(creditorIdx)}` : ""}!`
    );

    const solvent = this.players.filter((p) => !p.bankrupt);
    if (solvent.length <= 1) {
      this.finishGame();
      return true;
    }
    this.endTurn(playerIdx);
    return true;
  }

  finishGame() {
    const solvent = this.players.filter((p) => !p.bankrupt);
    const winner = solvent[0];
    winner.finishRank = 1;
    this.bankruptOrder.slice().reverse().forEach((idx, i) => {
      this.players[idx].finishRank = i + 2;
    });
    this.gameOver = true;
    this.turnPhase = "gameOver";
    this.pushLog(`${winner.name} won the game!`);
    this.emit();
  }

  // ---------- buying & auctions ----------

  buyProperty(playerIdx) {
    if (this.turnPhase !== "buyDecision" || playerIdx !== this.currentPlayerIndex) return false;
    const spaceId = this.pendingBuySpaceId;
    const space = spaceAt(spaceId);
    const player = this.players[playerIdx];
    if (player.cash < space.price) return false;
    player.cash -= space.price;
    this.properties[spaceId].ownerId = playerIdx;
    this.pendingBuySpaceId = null;
    this.pushLog(`${this.nameFor(playerIdx)} bought ${space.name} for $${space.price}.`);
    this.turnPhase = "postRollActions";
    this.emit();
    return true;
  }

  declineBuy(playerIdx) {
    if (this.turnPhase !== "buyDecision" || playerIdx !== this.currentPlayerIndex) return false;
    const spaceId = this.pendingBuySpaceId;
    this.pendingBuySpaceId = null;
    this.pushLog(`${this.nameFor(playerIdx)} declined to buy ${spaceAt(spaceId).name} - up for auction.`);
    this.startAuction(spaceId);
    return true;
  }

  startAuction(spaceId) {
    const order = [];
    for (let i = 0; i < this.numPlayers; i++) if (!this.players[i].bankrupt) order.push(i);
    this.auction = { spaceId, highBid: 0, highBidderIdx: null, order, passed: [], turnPtr: 0 };
    this.turnPhase = "auction";
    this.emit();
  }

  nextAuctionBidder() {
    const a = this.auction;
    if (!a) return null;
    const remaining = a.order.filter((i) => !a.passed.includes(i));
    if (remaining.length === 0) return null;
    for (let step = 0; step < a.order.length; step++) {
      const candidate = a.order[(a.turnPtr + step) % a.order.length];
      if (!a.passed.includes(candidate)) return candidate;
    }
    return null;
  }

  placeBid(playerIdx, amount) {
    const a = this.auction;
    if (!a || this.nextAuctionBidder() !== playerIdx) return false;
    const player = this.players[playerIdx];
    if (amount <= a.highBid || amount > player.cash) return false;
    a.highBid = amount;
    a.highBidderIdx = playerIdx;
    a.turnPtr = a.order.indexOf(playerIdx) + 1;
    this.pushLog(`${this.nameFor(playerIdx)} bid $${amount} for ${spaceAt(a.spaceId).name}.`);
    this.checkAuctionResolution();
    return true;
  }

  passAuction(playerIdx) {
    const a = this.auction;
    if (!a || this.nextAuctionBidder() !== playerIdx) return false;
    a.passed.push(playerIdx);
    a.turnPtr = a.order.indexOf(playerIdx) + 1;
    this.pushLog(`${this.nameFor(playerIdx)} passed on the auction.`);
    this.checkAuctionResolution();
    return true;
  }

  checkAuctionResolution() {
    const a = this.auction;
    const remaining = a.order.filter((i) => !a.passed.includes(i));
    if (remaining.length === 0) {
      this.pushLog(`No bids - ${spaceAt(a.spaceId).name} stays unowned.`);
      this.auction = null;
      this.turnPhase = "postRollActions";
      this.emit();
      return;
    }
    if (remaining.length === 1 && a.highBidderIdx !== null && remaining[0] === a.highBidderIdx) {
      this.resolveAuction();
      return;
    }
    this.emit();
  }

  resolveAuction() {
    const a = this.auction;
    const winner = this.players[a.highBidderIdx];
    winner.cash -= a.highBid;
    this.properties[a.spaceId].ownerId = a.highBidderIdx;
    this.pushLog(`${this.nameFor(a.highBidderIdx)} won the auction for ${spaceAt(a.spaceId).name} at $${a.highBid}.`);
    this.auction = null;
    this.turnPhase = "postRollActions";
    this.emit();
  }

  // ---------- cards ----------

  drawAndApplyCard(playerIdx, deckType) {
    const deckState = deckType === "chance" ? this.chance : this.chest;
    const card = drawCard(deckState);
    this.pendingCard = { deckType, card };
    this.turnPhase = "cardModal";
    this.emit();
  }

  acknowledgeCard(playerIdx) {
    if (playerIdx !== this.currentPlayerIndex || !this.pendingCard) return false;
    const { deckType, card } = this.pendingCard;
    this.pendingCard = null;
    if (card.effect.type !== "getOutOfJailFree") {
      discardCard(deckType === "chance" ? this.chance : this.chest, card);
    }
    this.applyCardEffect(playerIdx, card, deckType);
    return true;
  }

  applyCardEffect(playerIdx, card, deckType) {
    const player = this.players[playerIdx];
    const effect = card.effect;
    this.pushLog(`${this.nameFor(playerIdx)} drew: ${card.text}`);

    switch (effect.type) {
      case "advanceTo":
        this.movePlayerTo(playerIdx, effect.spaceId);
        this.resolveLanding(playerIdx);
        return;
      case "advanceToNearest": {
        const target = this.nearestSpaceOfKind(player.position, effect.kind);
        this.movePlayerTo(playerIdx, target);
        this.resolveLanding(playerIdx, { rentMultiplier: effect.rentMultiplier });
        return;
      }
      case "moveBy":
        if (effect.spaces < 0) this.movePlayerBackward(playerIdx, -effect.spaces);
        else this.movePlayerBy(playerIdx, effect.spaces);
        this.resolveLanding(playerIdx);
        return;
      case "goToJail":
        this.sendToJail(playerIdx);
        this.endTurn(playerIdx);
        return;
      case "getOutOfJailFree":
        player.jailFreeCards.push({ deckType, card });
        this.pushLog(`${this.nameFor(playerIdx)} kept a Get Out of Jail Free card.`);
        this.turnPhase = "postRollActions";
        this.emit();
        return;
      case "collect":
        player.cash += effect.amount;
        this.pushLog(`${this.nameFor(playerIdx)} collected $${effect.amount}.`);
        this.turnPhase = "postRollActions";
        this.emit();
        return;
      case "pay": {
        const paid = this.chargePlayer(playerIdx, effect.amount, null, card.text);
        if (paid) this.turnPhase = "postRollActions";
        this.emit();
        return;
      }
      case "payEachPlayer": {
        const paid = this.chargeEachOtherPlayer(playerIdx, effect.amount);
        if (paid) this.turnPhase = "postRollActions";
        this.emit();
        return;
      }
      case "collectFromEachPlayer":
        this.collectFromEachOtherPlayer(playerIdx, effect.amount);
        this.turnPhase = "postRollActions";
        this.emit();
        return;
      case "repairs": {
        const { houses, hotels } = this.countBuildings(playerIdx);
        const amount = houses * effect.perHouse + hotels * effect.perHotel;
        const paid = this.chargePlayer(playerIdx, amount, null, card.text);
        if (paid) this.turnPhase = "postRollActions";
        this.emit();
        return;
      }
      default:
        this.turnPhase = "postRollActions";
        this.emit();
    }
  }

  // ---------- jail ----------

  jailAction(playerIdx, action) {
    if (this.turnPhase !== "jailDecision" || playerIdx !== this.currentPlayerIndex) return false;
    const player = this.players[playerIdx];

    if (action === "useCard") {
      if (player.jailFreeCards.length === 0) return false;
      const held = player.jailFreeCards.pop();
      discardCard(held.deckType === "chance" ? this.chance : this.chest, held.card);
      player.inJail = false;
      player.jailTurns = 0;
      this.pushLog(`${this.nameFor(playerIdx)} used a Get Out of Jail Free card.`);
      this.turnPhase = "rollDice";
      this.emit();
      return true;
    }

    if (action === "pay") {
      const paid = this.chargePlayer(playerIdx, JAIL_FINE, null, "jail fine");
      if (paid) {
        player.inJail = false;
        player.jailTurns = 0;
        this.pushLog(`${this.nameFor(playerIdx)} paid $${JAIL_FINE} to leave Jail.`);
        this.turnPhase = "rollDice";
      }
      this.emit();
      return true;
    }

    if (action === "roll") {
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = 1 + Math.floor(Math.random() * 6);
      this.dice = [d1, d2];
      if (d1 === d2) {
        player.inJail = false;
        player.jailTurns = 0;
        this.pushLog(`${this.nameFor(playerIdx)} rolled ${d1}-${d2} and broke out of Jail!`);
        this.movePlayerBy(playerIdx, d1 + d2);
        this.resolveLanding(playerIdx);
        return true;
      }
      player.jailTurns += 1;
      this.pushLog(`${this.nameFor(playerIdx)} rolled ${d1}-${d2} - no doubles (attempt ${player.jailTurns}/${MAX_JAIL_TURNS}).`);
      if (player.jailTurns >= MAX_JAIL_TURNS) {
        const paid = this.chargePlayer(playerIdx, JAIL_FINE, null, "jail fine (3rd failed roll)");
        player.inJail = false;
        player.jailTurns = 0;
        if (paid) {
          this.movePlayerBy(playerIdx, d1 + d2);
          this.resolveLanding(playerIdx);
        } else {
          this.emit();
        }
        return true;
      }
      this.turnPhase = "postRollActions";
      this.emit();
      return true;
    }

    return false;
  }

  // ---------- houses / mortgages ----------

  _sellHouseAsset(playerIdx, spaceId) {
    if (!canSellHouse(this, playerIdx, spaceId)) return 0;
    const space = spaceAt(spaceId);
    const prop = this.properties[spaceId];
    const refund = Math.floor(space.houseCost / 2);
    if (prop.hotel) {
      prop.hotel = false;
      prop.houses = 4;
      this.bank.hotelsLeft += 1;
      this.bank.housesLeft -= 4;
    } else {
      prop.houses -= 1;
      this.bank.housesLeft += 1;
    }
    this.players[playerIdx].cash += refund;
    this.pushLog(`${this.nameFor(playerIdx)} sold a house on ${space.name} for $${refund}.`);
    return refund;
  }

  _mortgageAsset(playerIdx, spaceId) {
    if (!canMortgage(this, playerIdx, spaceId)) return 0;
    const prop = this.properties[spaceId];
    prop.mortgaged = true;
    const value = mortgageValueOf(spaceId);
    this.players[playerIdx].cash += value;
    this.pushLog(`${this.nameFor(playerIdx)} mortgaged ${spaceAt(spaceId).name} for $${value}.`);
    return value;
  }

  buildHouse(playerIdx, spaceId) {
    if (this.turnPhase !== "postRollActions" || playerIdx !== this.currentPlayerIndex) return false;
    if (!canBuildHouse(this, playerIdx, spaceId)) return false;
    const space = spaceAt(spaceId);
    const prop = this.properties[spaceId];
    const player = this.players[playerIdx];
    player.cash -= space.houseCost;
    if (prop.houses === 4) {
      prop.houses = 0;
      prop.hotel = true;
      this.bank.housesLeft += 4;
      this.bank.hotelsLeft -= 1;
      this.pushLog(`${this.nameFor(playerIdx)} built a hotel on ${space.name}.`);
    } else {
      prop.houses += 1;
      this.bank.housesLeft -= 1;
      this.pushLog(`${this.nameFor(playerIdx)} built a house on ${space.name} (${prop.houses}).`);
    }
    this.emit();
    return true;
  }

  sellHouse(playerIdx, spaceId) {
    if (this.turnPhase !== "postRollActions" || playerIdx !== this.currentPlayerIndex) return false;
    const amt = this._sellHouseAsset(playerIdx, spaceId);
    if (amt > 0) this.emit();
    return amt > 0;
  }

  mortgageProperty(playerIdx, spaceId) {
    if (this.turnPhase !== "postRollActions" || playerIdx !== this.currentPlayerIndex) return false;
    const amt = this._mortgageAsset(playerIdx, spaceId);
    if (amt > 0) this.emit();
    return amt > 0;
  }

  unmortgageProperty(playerIdx, spaceId) {
    if (this.turnPhase !== "postRollActions" || playerIdx !== this.currentPlayerIndex) return false;
    if (!canUnmortgage(this, playerIdx, spaceId)) return false;
    const cost = unmortgageCostOf(spaceId);
    this.players[playerIdx].cash -= cost;
    this.properties[spaceId].mortgaged = false;
    this.pushLog(`${this.nameFor(playerIdx)} unmortgaged ${spaceAt(spaceId).name} for $${cost}.`);
    this.emit();
    return true;
  }

  // ---------- trading ----------

  proposeTrade(fromIdx, toIdx, offer, request) {
    if (this.turnPhase !== "postRollActions" || fromIdx !== this.currentPlayerIndex || fromIdx !== 0) {
      return { valid: false, reason: "Trades can only be proposed by you, on your turn." };
    }
    const trade = {
      fromIdx, toIdx,
      offerCash: offer.cash || 0, offerPropertyIds: offer.propertyIds || [],
      requestCash: request.cash || 0, requestPropertyIds: request.propertyIds || [],
    };
    const validation = validateTrade(this, trade);
    if (!validation.valid) return validation;
    this.pendingTrade = trade;
    this.pushLog(`You proposed a trade to ${this.nameFor(toIdx)}.`);
    this.emit();
    return { valid: true };
  }

  respondToTrade(accept) {
    if (!this.pendingTrade) return false;
    const trade = this.pendingTrade;
    this.pendingTrade = null;
    if (!accept) {
      this.pushLog(`${this.nameFor(trade.toIdx)} rejected the trade.`);
      this.emit();
      return true;
    }
    const validation = validateTrade(this, trade);
    if (!validation.valid) {
      this.pushLog(`Trade could not go through: ${validation.reason}`);
      this.emit();
      return false;
    }
    const from = this.players[trade.fromIdx];
    const to = this.players[trade.toIdx];
    from.cash -= trade.offerCash;
    to.cash += trade.offerCash;
    to.cash -= trade.requestCash;
    from.cash += trade.requestCash;
    trade.offerPropertyIds.forEach((id) => { this.properties[id].ownerId = trade.toIdx; });
    trade.requestPropertyIds.forEach((id) => { this.properties[id].ownerId = trade.fromIdx; });
    this.pushLog(`${this.nameFor(trade.toIdx)} accepted the trade with ${this.nameFor(trade.fromIdx)}.`);
    this.emit();
    return true;
  }

  cancelTrade() {
    if (!this.pendingTrade) return false;
    this.pendingTrade = null;
    this.emit();
    return true;
  }

  // ---------- turn flow ----------

  endPostRollActions(playerIdx) {
    if (this.turnPhase !== "postRollActions" || playerIdx !== this.currentPlayerIndex) return false;
    this.endTurn(playerIdx);
    return true;
  }

  endTurn(playerIdx) {
    if (this.gameOver) return;
    const player = this.players[playerIdx];
    if (!player.bankrupt && !player.inJail && this.rolledDoublesThisTurn) {
      this.rolledDoublesThisTurn = false;
      this.turnPhase = "rollDice";
      this.pushLog(`${this.nameFor(playerIdx)} rolled doubles - go again!`);
      this.emit();
      return;
    }
    this.rolledDoublesThisTurn = false;
    const nextIdx = this.nextActiveIndex(playerIdx);
    this.currentPlayerIndex = nextIdx;
    const nextPlayer = this.players[nextIdx];
    nextPlayer.doublesStreak = 0;
    this.turnPhase = nextPlayer.inJail ? "jailDecision" : "rollDice";
    this.emit();
  }
}
