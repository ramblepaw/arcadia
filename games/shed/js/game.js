import { createDeck, shuffle, cardLabel } from "./deck.js";
import { canPlayCard, hasLegalPlay, nextRequirement, burnsFromPlay } from "./rules.js";

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

export class Game {
  constructor(numBots) {
    this.numPlayers = numBots + 1;
    this.players = [];
    this.players.push({
      id: 0, name: "You", isHuman: true,
      hand: [], faceUp: [], faceDown: [],
      finished: false, finishRank: null, swapReady: false,
    });
    const botNames = pickBotNames(numBots);
    for (let i = 1; i <= numBots; i++) {
      this.players.push({
        id: i, name: botNames[i - 1], isHuman: false,
        hand: [], faceUp: [], faceDown: [],
        finished: false, finishRank: null, swapReady: false,
      });
    }
    this.finishOrder = [];
    this.phase = "swap"; // "swap" -> "playing" -> "gameOver"
    this.pile = [];
    this.pileRequirement = { type: "open" };
    this.listeners = [];
    this.currentPlayerIndex = 0;
    this.deal();
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  deal() {
    this.drawPile = shuffle(createDeck());
    for (const p of this.players) {
      p.faceDown = [this.drawPile.pop(), this.drawPile.pop(), this.drawPile.pop()];
      p.faceUp = [this.drawPile.pop(), this.drawPile.pop(), this.drawPile.pop()];
      p.hand = [this.drawPile.pop(), this.drawPile.pop(), this.drawPile.pop()];
    }
    this.message = "Swap cards between your hand and face-up pile, then get ready.";
    this.emit();
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  get isGameOver() {
    return this.phase === "gameOver";
  }

  // --- Swap phase ---

  swapCards(playerIdx, handCardId, faceUpCardId) {
    if (this.phase !== "swap") return false;
    const p = this.players[playerIdx];
    if (p.swapReady) return false;
    const hi = p.hand.findIndex((c) => c.id === handCardId);
    const fi = p.faceUp.findIndex((c) => c.id === faceUpCardId);
    if (hi === -1 || fi === -1) return false;
    const tmp = p.hand[hi];
    p.hand[hi] = p.faceUp[fi];
    p.faceUp[fi] = tmp;
    this.emit();
    return true;
  }

  finishSwap(playerIdx) {
    if (this.phase !== "swap") return false;
    this.players[playerIdx].swapReady = true;
    if (this.players.every((p) => p.swapReady)) {
      this.beginPlay();
    } else {
      this.emit();
    }
    return true;
  }

  beginPlay() {
    this.phase = "playing";
    let bestIdx = 0;
    let bestRank = Infinity;
    this.players.forEach((p, i) => {
      p.hand.forEach((c) => {
        if (c.rank < bestRank) {
          bestRank = c.rank;
          bestIdx = i;
        }
      });
    });
    this.currentPlayerIndex = bestIdx;
    this.message = `${this.players[bestIdx].name} holds the lowest card and starts.`;
    this.emit();
  }

  // --- Playing phase ---

  /** Which zone ("hand" | "faceUp" | "faceDown" | null-if-finished) a player must currently play from. */
  activeZoneName(p) {
    if (p.hand.length > 0) return "hand";
    if (p.faceUp.length > 0) return "faceUp";
    if (p.faceDown.length > 0) return "faceDown";
    return null;
  }

  currentZone() {
    return this.activeZoneName(this.currentPlayer);
  }

  hasAnyLegalPlay(playerIdx) {
    const p = this.players[playerIdx];
    const zone = this.activeZoneName(p);
    if (zone === "faceDown" || zone === null) return false;
    return hasLegalPlay(p[zone], this.pileRequirement);
  }

  refillHand(p) {
    while (p.hand.length < 3 && this.drawPile.length > 0) {
      p.hand.push(this.drawPile.pop());
    }
  }

  checkFinished(p) {
    return p.hand.length === 0 && this.drawPile.length === 0 &&
      p.faceUp.length === 0 && p.faceDown.length === 0;
  }

  recordFinish(p) {
    p.finished = true;
    this.finishOrder.push(p.id);
    p.finishRank = this.finishOrder.length;
  }

  stepFrom(startIdx, steps) {
    let idx = startIdx;
    let remaining = steps;
    while (remaining > 0) {
      idx = (idx + 1) % this.numPlayers;
      if (!this.players[idx].finished) remaining--;
    }
    return idx;
  }

  finishGame() {
    const remaining = this.players.filter((p) => !p.finished);
    remaining.forEach((p) => {
      p.finished = true;
      this.finishOrder.push(p.id);
      p.finishRank = this.finishOrder.length;
    });
    this.phase = "gameOver";
    this.message = remaining.length === 1
      ? `${remaining[0].name} is left holding the pile - the Shed!`
      : "Game over.";
    this.emit();
  }

  advanceTurn(actingIdx, { burned, skip, justFinished }) {
    const activeCount = this.players.filter((p) => !p.finished).length;
    if (activeCount <= 1) {
      this.finishGame();
      return;
    }
    if (burned && !justFinished) {
      this.currentPlayerIndex = actingIdx;
    } else {
      this.currentPlayerIndex = this.stepFrom(actingIdx, 1 + skip);
    }
    this.emit();
  }

  resolvePlayEffects(playerIdx, rank, count) {
    const p = this.players[playerIdx];
    const burned = burnsFromPlay(this.pile, rank);
    if (burned) {
      this.pile = [];
      this.pileRequirement = { type: "open" };
    } else {
      this.pileRequirement = nextRequirement(rank);
    }
    const justFinished = this.checkFinished(p);
    if (justFinished) this.recordFinish(p);
    const skip = !burned && rank === 8 ? count : 0;

    if (justFinished) {
      this.message = `${p.name} is out!`;
    } else if (burned) {
      this.message = `${p.name} burned the pile and goes again!`;
    } else {
      this.message = `${p.name} played.`;
    }
    this.advanceTurn(playerIdx, { burned, skip, justFinished });
  }

  /** Play one or more same-rank cards from the current player's hand or face-up zone. */
  playCards(playerIdx, cardIds) {
    if (playerIdx !== this.currentPlayerIndex || this.phase !== "playing") {
      return { valid: false, reason: "Not your turn." };
    }
    if (!cardIds || cardIds.length === 0) {
      return { valid: false, reason: "Select at least one card." };
    }
    const p = this.players[playerIdx];
    const zone = this.activeZoneName(p);
    if (zone !== "hand" && zone !== "faceUp") {
      return { valid: false, reason: "Flip a face-down card instead." };
    }
    const zoneArr = p[zone];
    const uniqueIds = [...new Set(cardIds)];
    const cards = uniqueIds.map((id) => zoneArr.find((c) => c.id === id));
    if (cards.some((c) => !c)) {
      return { valid: false, reason: "Select only your own available cards." };
    }
    const rank = cards[0].rank;
    if (!cards.every((c) => c.rank === rank)) {
      return { valid: false, reason: "Selected cards must all be the same rank." };
    }
    if (!canPlayCard(cards[0], this.pileRequirement)) {
      return { valid: false, reason: "That card can't be played on the pile right now." };
    }

    uniqueIds.forEach((id) => {
      const i = zoneArr.findIndex((c) => c.id === id);
      zoneArr.splice(i, 1);
    });
    this.pile.push(...cards);
    if (zone === "hand") this.refillHand(p);
    this.resolvePlayEffects(playerIdx, rank, cards.length);
    return { valid: true };
  }

  /** Blind-flip one face-down card and attempt to play it. */
  flipFaceDown(playerIdx, cardId) {
    if (playerIdx !== this.currentPlayerIndex || this.phase !== "playing") return false;
    const p = this.players[playerIdx];
    if (this.activeZoneName(p) !== "faceDown") return false;
    const idx = p.faceDown.findIndex((c) => c.id === cardId);
    if (idx === -1) return false;
    const [card] = p.faceDown.splice(idx, 1);

    if (!canPlayCard(card, this.pileRequirement)) {
      p.hand.push(card, ...this.pile);
      this.pile = [];
      this.pileRequirement = { type: "open" };
      this.message = `${p.name} flipped ${cardLabel(card)} - no good, picks up the pile.`;
      this.advanceTurn(playerIdx, { burned: false, skip: 0, justFinished: false });
      return true;
    }

    this.pile.push(card);
    this.resolvePlayEffects(playerIdx, card.rank, 1);
    return true;
  }

  /** Voluntary (or forced) pickup of the whole pile into hand. Not available from the face-down zone. */
  pickUpPile(playerIdx) {
    if (playerIdx !== this.currentPlayerIndex || this.phase !== "playing") return false;
    const p = this.players[playerIdx];
    const zone = this.activeZoneName(p);
    if (zone === "faceDown" || zone === null) return false;
    if (this.pile.length === 0) return false;
    p.hand.push(...this.pile);
    this.pile = [];
    this.pileRequirement = { type: "open" };
    this.message = `${p.name} picked up the pile.`;
    this.advanceTurn(playerIdx, { burned: false, skip: 0, justFinished: false });
    return true;
  }

  standings() {
    return this.players
      .slice()
      .sort((a, b) => (a.finishRank ?? 999) - (b.finishRank ?? 999));
  }
}
