import { createDeck, shuffle, cardValue } from "./deck.js";
import { evaluateHand, classifyGroup } from "./rules.js";

const TOTAL_ROUNDS = 11;
const FIRST_HAND_SIZE = 3;

const BOT_NAMES = [
  "Ada", "Beau", "Casey", "Dana", "Ezra", "Finch", "Gwen", "Huxley",
  "Ivy", "Jules", "Kira", "Lennon", "Marlowe", "Nico", "Orin", "Piper",
  "Quinn", "Reyna", "Sable", "Tobin",
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
  // mode: "assisted" (deadwood/going-out always computed optimally by the
  // solver) or "manual" (the human player must declare their own books/runs
  // via formGroup/ungroupCards - misgrouped or ungrouped cards score as
  // deadwood even if a better arrangement existed). Bots always play at full
  // strength regardless of mode; only the human does manual bookkeeping.
  constructor(numBots, mode = "assisted") {
    this.mode = mode;
    this.numPlayers = numBots + 1;
    this.players = [];
    this.players.push({ id: 0, name: "You", isHuman: true, hand: [], totalScore: 0, roundScores: [] });
    const botNames = pickBotNames(numBots);
    for (let i = 1; i <= numBots; i++) {
      this.players.push({ id: i, name: botNames[i - 1], isHuman: false, hand: [], totalScore: 0, roundScores: [] });
    }
    this.round = 1;
    this.listeners = [];
    this.startRound();
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  get handSize() {
    return FIRST_HAND_SIZE + (this.round - 1);
  }

  get wildRank() {
    return this.handSize;
  }

  startRound() {
    this.deck = shuffle(createDeck());
    this.stock = this.deck.slice();
    this.discard = [];
    this.goneOutPlayerIndex = null;
    this.finalTurnPlayersRemaining = 0;
    this.roundOver = false;
    this.lastDiscarderIdx = null;

    const size = this.handSize;
    for (const p of this.players) {
      p.hand = [];
      p.hasDrawn = false;
      p.drawnFromDiscard = false;
      p.drawnCardId = null;
      p.wentOut = false;
      p.groups = [];
    }
    for (let c = 0; c < size; c++) {
      for (const p of this.players) {
        p.hand.push(this.stock.pop());
      }
    }
    this.discard.push(this.stock.pop());

    this.currentPlayerIndex = (this.round - 1) % this.numPlayers;
    this.turnPhase = "draw";
    this.message = `Round ${this.round} begins. Wild rank: ${this.wildRank === 13 ? "K" : this.wildRank === 12 ? "Q" : this.wildRank === 11 ? "J" : this.wildRank}s.`;
    this.emit();
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  reshuffleStockIfNeeded() {
    if (this.stock.length > 0) return;
    if (this.discard.length <= 1) return; // nothing to reshuffle with
    const top = this.discard.pop();
    this.stock = shuffle(this.discard);
    this.discard = [top];
  }

  drawFromStock(playerIdx) {
    if (playerIdx !== this.currentPlayerIndex || this.turnPhase !== "draw") return false;
    this.reshuffleStockIfNeeded();
    if (this.stock.length === 0) return false;
    const card = this.stock.pop();
    const p = this.players[playerIdx];
    p.hand.push(card);
    p.hasDrawn = true;
    p.drawnFromDiscard = false;
    p.drawnCardId = card.id;
    this.turnPhase = "discard";
    this.message = `${p.name} drew from the stock.`;
    this.emit();
    return true;
  }

  drawFromDiscard(playerIdx) {
    if (playerIdx !== this.currentPlayerIndex || this.turnPhase !== "draw") return false;
    if (this.discard.length === 0) return false;
    const card = this.discard.pop();
    const p = this.players[playerIdx];
    p.hand.push(card);
    p.hasDrawn = true;
    p.drawnFromDiscard = true;
    p.drawnCardId = card.id;
    this.turnPhase = "discard";
    this.message = `${p.name} picked up the discard.`;
    this.emit();
    return true;
  }

  canDiscard(playerIdx, cardId) {
    if (playerIdx !== this.currentPlayerIndex || this.turnPhase !== "discard") return false;
    const p = this.players[playerIdx];
    if (p.drawnFromDiscard && cardId === p.drawnCardId) return false;
    if (this.mode === "manual" && this.groupedCardIds(playerIdx).has(cardId)) return false;
    return p.hand.some((c) => c.id === cardId);
  }

  // --- Manual mode: the player declares their own books/runs. ---

  groupedCardIds(playerIdx) {
    const ids = new Set();
    this.players[playerIdx].groups.forEach((g) => g.cardIds.forEach((id) => ids.add(id)));
    return ids;
  }

  looseCardIds(playerIdx) {
    const grouped = this.groupedCardIds(playerIdx);
    return this.players[playerIdx].hand.filter((c) => !grouped.has(c.id)).map((c) => c.id);
  }

  /** Validates and, if legal, locks in a new group from currently-loose cards. */
  formGroup(playerIdx, cardIds) {
    if (this.mode !== "manual") return { valid: false, reason: "Not in manual mode." };
    const p = this.players[playerIdx];
    const grouped = this.groupedCardIds(playerIdx);
    const uniqueIds = [...new Set(cardIds)];
    if (uniqueIds.length !== cardIds.length) {
      return { valid: false, reason: "Duplicate card selected." };
    }
    const cards = uniqueIds.map((id) => p.hand.find((c) => c.id === id));
    if (cards.some((c) => !c) || cards.some((c) => grouped.has(c.id))) {
      return { valid: false, reason: "Select only loose cards from your own hand." };
    }
    const result = classifyGroup(cards, this.wildRank);
    if (!result.valid) return result;
    p.groups.push({ kind: result.kind, cardIds: uniqueIds });
    this.emit();
    return result;
  }

  ungroupCards(playerIdx, groupIndex) {
    if (this.mode !== "manual") return false;
    const p = this.players[playerIdx];
    if (groupIndex < 0 || groupIndex >= p.groups.length) return false;
    p.groups.splice(groupIndex, 1);
    this.emit();
    return true;
  }

  discardCard(playerIdx, cardId) {
    if (!this.canDiscard(playerIdx, cardId)) return false;
    const p = this.players[playerIdx];
    const idx = p.hand.findIndex((c) => c.id === cardId);
    const [card] = p.hand.splice(idx, 1);
    this.discard.push(card);
    this.lastDiscarderIdx = playerIdx;
    this.message = `${p.name} discarded.`;
    this.advanceTurn(playerIdx);
    return true;
  }

  // Going out: like a normal discard, except the hand you keep (dealt size,
  // i.e. hand minus this discard) must be fully matched with zero deadwood.
  // Only the first player to do so in a round triggers it - after that,
  // everyone else is already on their final lap and just discards normally
  // (a zero-deadwood hand at that point still scores 0 via endRound anyway).
  canGoOutWithCard(playerIdx, cardId) {
    if (this.goneOutPlayerIndex !== null) return false;
    if (!this.canDiscard(playerIdx, cardId)) return false;
    const p = this.players[playerIdx];
    // Manual bookkeeping only applies to the human - bots never call
    // formGroup, so a bot's groups stay empty and it must keep using the
    // solver, or it could never legally go out in a manual-mode game.
    if (this.mode === "manual" && p.isHuman) {
      // canDiscard already rejected grouped cards, so cardId is loose here;
      // going out means it's the *only* loose card - everything else must
      // already be sitting in a group the player declared themselves.
      const loose = this.looseCardIds(playerIdx);
      return loose.length === 1 && loose[0] === cardId;
    }
    const remaining = p.hand.filter((c) => c.id !== cardId);
    return evaluateHand(remaining, this.wildRank).deadwoodValue === 0;
  }

  hasGoOutOption(playerIdx) {
    if (playerIdx !== this.currentPlayerIndex || this.turnPhase !== "discard") return false;
    const p = this.players[playerIdx];
    return p.hand.some((c) => this.canGoOutWithCard(playerIdx, c.id));
  }

  goOut(playerIdx, cardId) {
    if (!this.canGoOutWithCard(playerIdx, cardId)) return false;
    const p = this.players[playerIdx];
    const idx = p.hand.findIndex((c) => c.id === cardId);
    const [card] = p.hand.splice(idx, 1);
    this.discard.push(card);
    this.lastDiscarderIdx = playerIdx;
    p.wentOut = true;
    this.goneOutPlayerIndex = playerIdx;
    this.finalTurnPlayersRemaining = this.numPlayers - 1;
    this.message = `${p.name} went out!`;
    if (this.finalTurnPlayersRemaining === 0) {
      this.endRound();
    } else {
      this.moveToNextPlayer();
      this.turnPhase = "draw";
      this.emit();
    }
    return true;
  }

  advanceTurn(playerIdx) {
    if (this.goneOutPlayerIndex !== null) {
      this.finalTurnPlayersRemaining -= 1;
      if (this.finalTurnPlayersRemaining <= 0) {
        this.endRound();
        return;
      }
    }
    this.moveToNextPlayer();
    this.turnPhase = "draw";
    this.emit();
  }

  moveToNextPlayer() {
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.numPlayers;
    } while (this.goneOutPlayerIndex === this.currentPlayerIndex);
  }

  endRound() {
    this.roundOver = true;
    for (const p of this.players) {
      let score;
      if (p.wentOut) {
        score = 0;
      } else if (this.mode === "manual" && p.isHuman) {
        // Scored on what the player actually declared, not the best-possible
        // arrangement - an ungrouped or misgrouped card counts as deadwood
        // even if a valid meld for it existed and they just didn't find it.
        const loose = this.looseCardIds(p.id);
        const byId = new Map(p.hand.map((c) => [c.id, c]));
        score = loose.reduce((sum, id) => sum + cardValue(byId.get(id), this.wildRank), 0);
      } else {
        score = evaluateHand(p.hand, this.wildRank).deadwoodValue;
      }
      p.roundScores.push(score);
      p.totalScore += score;
    }
    this.message = "Round over.";
    if (this.round >= TOTAL_ROUNDS) {
      this.gameOver = true;
    }
    this.emit();
  }

  nextRound() {
    if (this.round >= TOTAL_ROUNDS) return;
    this.round += 1;
    this.startRound();
  }

  standings() {
    return this.players
      .map((p) => ({ id: p.id, name: p.name, totalScore: p.totalScore, isHuman: p.isHuman }))
      .sort((a, b) => a.totalScore - b.totalScore);
  }
}
