import { createDeck, shuffle, rankLabelPlural } from "./deck.js";
import { requiredRankAt } from "./rules.js";

const MAX_RESOLVED_PLAYS = 500;

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
    this.players.push({ id: 0, name: "You", isHuman: true, hand: [], finished: false, finishRank: null });
    const botNames = pickBotNames(numBots);
    for (let i = 1; i <= numBots; i++) {
      this.players.push({ id: i, name: botNames[i - 1], isHuman: false, hand: [], finished: false, finishRank: null });
    }

    this.phase = "playing"; // "playing" -> "gameOver"
    this.pile = [];
    this.sequenceIndex = 0;
    this.pendingPlay = null; // { playerIdx, claimedRank, cards }
    this.challengeQueue = [];
    this.log = [];
    this.message = "";
    this.resolvedPlays = 0;
    this.listeners = [];

    this.deal();
    this.currentPlayerIndex = Math.floor(Math.random() * this.numPlayers);
    const starter = this.players[this.currentPlayerIndex];
    this.pushLog(starter.isHuman ? "You go first." : `${starter.name} goes first.`);
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  pushLog(text) {
    this.message = text;
    this.log.push(text);
    if (this.log.length > 40) this.log.shift();
  }

  deal() {
    const deck = shuffle(createDeck());
    let i = 0;
    while (deck.length > 0) {
      this.players[i % this.numPlayers].hand.push(deck.pop());
      i++;
    }
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  get isGameOver() {
    return this.phase === "gameOver";
  }

  requiredRank() {
    return requiredRankAt(this.sequenceIndex);
  }

  /** Next active (unfinished) player index after `fromIdx`, walking forward. */
  nextActiveIndex(fromIdx) {
    const n = this.numPlayers;
    for (let step = 1; step <= n; step++) {
      const idx = (fromIdx + step) % n;
      if (!this.players[idx].finished) return idx;
    }
    return fromIdx;
  }

  /** Who (if anyone) is still waiting to decide on the current pending play. */
  nextChallenger() {
    return this.challengeQueue.length > 0 ? this.challengeQueue[0] : null;
  }

  /** Play 1-4 cards from the current player's hand, claiming the required rank (may be a bluff). */
  playCards(playerIdx, cardIds) {
    if (playerIdx !== this.currentPlayerIndex || this.phase !== "playing" || this.pendingPlay) {
      return { valid: false, reason: "Not your turn to play." };
    }
    if (!cardIds || cardIds.length === 0 || cardIds.length > 4) {
      return { valid: false, reason: "Select 1 to 4 cards." };
    }
    const p = this.players[playerIdx];
    const uniqueIds = [...new Set(cardIds)];
    const cards = uniqueIds.map((id) => p.hand.find((c) => c.id === id));
    if (cards.some((c) => !c)) {
      return { valid: false, reason: "Select only cards from your own hand." };
    }

    const claimedRank = this.requiredRank();
    uniqueIds.forEach((id) => {
      const i = p.hand.findIndex((c) => c.id === id);
      p.hand.splice(i, 1);
    });

    this.pendingPlay = { playerIdx, claimedRank, cards };
    this.challengeQueue = [];
    for (let step = 1; step < this.numPlayers; step++) {
      const idx = (playerIdx + step) % this.numPlayers;
      if (!this.players[idx].finished) this.challengeQueue.push(idx);
    }

    this.pushLog(
      p.isHuman
        ? `You play ${cards.length} card(s), claiming ${rankLabelPlural(claimedRank)}.`
        : `${p.name} plays ${cards.length} card(s), claiming ${rankLabelPlural(claimedRank)}.`
    );
    this.emit();
    return { valid: true };
  }

  /** The next queued challenger declines to call it. */
  passChallenge(playerIdx) {
    if (!this.pendingPlay || this.nextChallenger() !== playerIdx) return false;
    this.challengeQueue.shift();
    if (this.challengeQueue.length === 0) {
      this.resolveUnchallenged();
    } else {
      this.emit();
    }
    return true;
  }

  /** The next queued challenger calls "Cheat!" on the pending play. */
  callCheat(playerIdx) {
    if (!this.pendingPlay || this.nextChallenger() !== playerIdx) return false;
    this.resolveChallenge(playerIdx);
    return true;
  }

  resolveUnchallenged() {
    const { playerIdx, cards } = this.pendingPlay;
    this.pile.push(...cards);
    const p = this.players[playerIdx];
    this.pendingPlay = null;
    this.challengeQueue = [];

    if (p.hand.length === 0) {
      this.pushLog(p.isHuman ? "Nobody called it - you're out!" : `Nobody called it - ${p.name} is out!`);
      this.winGame(p);
      return;
    }
    this.advanceAfterResolution(playerIdx);
  }

  resolveChallenge(challengerIdx) {
    const { playerIdx, claimedRank, cards } = this.pendingPlay;
    const player = this.players[playerIdx];
    const challenger = this.players[challengerIdx];
    const lie = cards.some((c) => c.rank !== claimedRank);
    const pot = [...this.pile, ...cards];
    this.pile = [];
    this.pendingPlay = null;
    this.challengeQueue = [];

    if (lie) {
      player.hand.push(...pot);
      this.pushLog(
        `${challenger.isHuman ? "You call" : `${challenger.name} calls`} Cheat - caught! ` +
        `${player.isHuman ? "You pick" : `${player.name} picks`} up ${pot.length} card(s).`
      );
      this.advanceAfterResolution(playerIdx);
      return;
    }

    challenger.hand.push(...pot);
    this.pushLog(
      `${challenger.isHuman ? "You call" : `${challenger.name} calls`} Cheat - it was true! ` +
      `${challenger.isHuman ? "You pick" : `${challenger.name} picks`} up ${pot.length} card(s).`
    );

    if (player.hand.length === 0) {
      this.winGame(player);
      return;
    }
    this.advanceAfterResolution(playerIdx);
  }

  advanceAfterResolution(originalPlayerIdx) {
    this.sequenceIndex++;
    this.resolvedPlays++;
    if (this.resolvedPlays >= MAX_RESOLVED_PLAYS) {
      this.forceStalemateEnd();
      return;
    }
    this.currentPlayerIndex = this.nextActiveIndex(originalPlayerIdx);
    this.emit();
  }

  winGame(winner) {
    winner.finished = true;
    winner.finishRank = 1;
    const others = this.players.filter((pl) => pl.id !== winner.id);
    others.sort((a, b) => a.hand.length - b.hand.length);
    others.forEach((pl, i) => {
      pl.finished = true;
      pl.finishRank = i + 2;
    });
    this.phase = "gameOver";
    this.emit();
  }

  forceStalemateEnd() {
    const remaining = this.players.filter((p) => !p.finished);
    remaining.sort((a, b) => a.hand.length - b.hand.length);
    remaining.forEach((p, i) => {
      p.finished = true;
      p.finishRank = i + 1;
    });
    this.phase = "gameOver";
    this.pushLog("Play ran long - ending by fewest cards held.");
    this.emit();
  }

  standings() {
    return this.players.slice().sort((a, b) => (a.finishRank ?? 999) - (b.finishRank ?? 999));
  }
}
