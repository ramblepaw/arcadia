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
    const starter = this.players[bestIdx];
    this.message = starter.isHuman
      ? "You hold the lowest card and start."
      : `${starter.name} holds the lowest card and starts.`;
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

  /** The first player to empty hand+face-up+face-down wins - the game ends immediately. */
  winGame(winner) {
    winner.finished = true;
    winner.finishRank = 1;
    const others = this.players.filter((pl) => pl.id !== winner.id);
    others.sort((a, b) => {
      const totalA = a.hand.length + a.faceUp.length + a.faceDown.length;
      const totalB = b.hand.length + b.faceUp.length + b.faceDown.length;
      return totalA - totalB;
    });
    others.forEach((pl, i) => {
      pl.finished = true;
      pl.finishRank = i + 2;
    });
    this.phase = "gameOver";
    this.message = winner.isHuman ? "You win!" : `${winner.name} wins!`;
    this.emit();
  }

  stepFrom(startIdx, steps) {
    return (startIdx + steps) % this.numPlayers;
  }

  advanceTurn(actingIdx, { burned, skip }) {
    if (burned) {
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

    if (this.checkFinished(p)) {
      this.winGame(p);
      return;
    }

    const skip = !burned && rank === 8 ? count : 0;
    this.message = burned
      ? `${p.name} burned the pile and ${p.isHuman ? "go" : "goes"} again!`
      : `${p.name} played.`;
    this.advanceTurn(playerIdx, { burned, skip });
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
      this.message = p.isHuman
        ? `You flipped ${cardLabel(card)} - no good, pick up the pile.`
        : `${p.name} flipped ${cardLabel(card)} - no good, picks up the pile.`;
      this.advanceTurn(playerIdx, { burned: false, skip: 0 });
      return true;
    }

    this.pile.push(card);
    this.resolvePlayEffects(playerIdx, card.rank, 1);
    return true;
  }

  /** Forced pickup of the whole pile into hand - only legal when the player has no playable card. */
  pickUpPile(playerIdx) {
    if (playerIdx !== this.currentPlayerIndex || this.phase !== "playing") return false;
    const p = this.players[playerIdx];
    const zone = this.activeZoneName(p);
    if (zone === "faceDown" || zone === null) return false;
    if (this.pile.length === 0) return false;
    if (this.hasAnyLegalPlay(playerIdx)) return false;
    p.hand.push(...this.pile);
    this.pile = [];
    this.pileRequirement = { type: "open" };
    this.message = `${p.name} picked up the pile.`;
    this.advanceTurn(playerIdx, { burned: false, skip: 0 });
    return true;
  }

  standings() {
    return this.players
      .slice()
      .sort((a, b) => (a.finishRank ?? 999) - (b.finishRank ?? 999));
  }
}
