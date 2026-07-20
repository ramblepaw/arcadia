import { buildBoard, buildDrawDeck, HAND_SIZE_BY_PLAYERS, isTwoEyedJack, isOneEyedJack } from "./board-data.js";
import { cardTargets, isCardDead, findNewSequences } from "./rules.js";

const BOT_NAMES = ["Ada", "Beau", "Casey", "Dana", "Ezra", "Finch", "Gwen", "Huxley"];
export const PLAYER_COLORS = ["#3d6fb5", "#c0392b", "#2e9e5b", "#c9a227"];

function pickBotNames(count) {
  const pool = [...BOT_NAMES];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function makePlayer(id, name, isHuman, color) {
  return { id, name, isHuman, color, hand: [], sequences: [], sequenceCount: 0 };
}

export class Game {
  constructor(numBots) {
    this.numPlayers = numBots + 1;
    this.players = [makePlayer(0, "You", true, PLAYER_COLORS[0])];
    const botNames = pickBotNames(numBots);
    for (let i = 1; i <= numBots; i++) {
      this.players.push(makePlayer(i, botNames[i - 1], false, PLAYER_COLORS[i]));
    }

    this.board = buildBoard();
    this.deck = buildDrawDeck();

    const handSize = HAND_SIZE_BY_PLAYERS[this.numPlayers] ?? 6;
    for (const player of this.players) {
      for (let i = 0; i < handSize; i++) {
        const card = this.deck.pop();
        if (card) player.hand.push(card);
      }
    }

    this.sequencesToWin = this.numPlayers === 2 ? 2 : 1;
    this.currentPlayerIndex = Math.floor(Math.random() * this.numPlayers);
    this.gameOver = false;
    this.winnerId = null;
    this.lastMove = null; // { cellId, type: "place" | "remove" }
    this.emptyHandStreak = 0;

    this.log = [];
    this.listeners = [];

    this.pushLog(`${this.currentPlayer.name} goes first.`);
  }

  subscribe(fn) { this.listeners.push(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }

  pushLog(text) {
    this.log.push(text);
    if (this.log.length > 60) this.log.shift();
  }

  get currentPlayer() { return this.players[this.currentPlayerIndex]; }
  get isGameOver() { return this.gameOver; }

  cardLabel(card) {
    if (card.rank === "J" && isTwoEyedJack(card)) return "two-eyed Jack";
    if (card.rank === "J" && isOneEyedJack(card)) return "one-eyed Jack";
    return `${card.rank} of ${{ S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" }[card.suit]}`;
  }

  targetsFor(playerIdx, cardId) {
    const player = this.players[playerIdx];
    const card = player.hand.find((c) => c.id === cardId);
    if (!card) return { kind: "none", cells: [] };
    return cardTargets(this.board, card, player.id);
  }

  // ---------- actions ----------

  playCard(playerIdx, cardId, cellId) {
    if (this.gameOver || playerIdx !== this.currentPlayerIndex) return { valid: false, reason: "Not your turn." };
    const player = this.players[playerIdx];
    const cardIdx = player.hand.findIndex((c) => c.id === cardId);
    if (cardIdx === -1) return { valid: false, reason: "Card not in hand." };
    const card = player.hand[cardIdx];
    if (isOneEyedJack(card)) return { valid: false, reason: "Use a one-eyed jack to remove a chip instead." };

    const targets = cardTargets(this.board, card, player.id);
    if (targets.kind !== "place" || !targets.cells.includes(cellId)) {
      return { valid: false, reason: "That space isn't a legal target for this card." };
    }

    this.board[cellId].chip = player.id;
    player.hand.splice(cardIdx, 1);
    this.pushLog(`${player.name} placed a chip with the ${this.cardLabel(card)}.`);
    this.lastMove = { cellId, type: "place" };

    const newSequences = findNewSequences(this.board, player.id, cellId, player.sequences);
    for (const seqCells of newSequences) {
      for (const id of seqCells) if (!this.board[id].isCorner) this.board[id].locked = true;
      player.sequences.push(seqCells);
      player.sequenceCount++;
      this.pushLog(`${player.name} completed a sequence! (${player.sequenceCount}/${this.sequencesToWin})`);
    }

    if (player.sequenceCount >= this.sequencesToWin) {
      this.gameOver = true;
      this.winnerId = player.id;
      this.pushLog(`${player.name} wins!`);
      this.emit();
      return { valid: true };
    }

    this.emptyHandStreak = 0;
    this.drawReplacement(player);
    this.advanceTurn();
    this.emit();
    return { valid: true };
  }

  removeChip(playerIdx, cardId, cellId) {
    if (this.gameOver || playerIdx !== this.currentPlayerIndex) return { valid: false, reason: "Not your turn." };
    const player = this.players[playerIdx];
    const cardIdx = player.hand.findIndex((c) => c.id === cardId);
    if (cardIdx === -1) return { valid: false, reason: "Card not in hand." };
    const card = player.hand[cardIdx];
    if (!isOneEyedJack(card)) return { valid: false, reason: "That card can't remove a chip." };

    const targets = cardTargets(this.board, card, player.id);
    if (!targets.cells.includes(cellId)) return { valid: false, reason: "That chip can't be removed." };

    const owner = this.players.find((p) => p.id === this.board[cellId].chip);
    this.board[cellId].chip = null;
    player.hand.splice(cardIdx, 1);
    const ownerPossessive = owner ? (owner.isHuman ? "your" : `${owner.name}'s`) : "a";
    this.pushLog(`${player.name} used a one-eyed jack to remove ${ownerPossessive} chip.`);
    this.lastMove = { cellId, type: "remove" };

    this.emptyHandStreak = 0;
    this.drawReplacement(player);
    this.advanceTurn();
    this.emit();
    return { valid: true };
  }

  discardDeadCard(playerIdx, cardId) {
    if (this.gameOver || playerIdx !== this.currentPlayerIndex) return { valid: false, reason: "Not your turn." };
    const player = this.players[playerIdx];
    const cardIdx = player.hand.findIndex((c) => c.id === cardId);
    if (cardIdx === -1) return { valid: false, reason: "Card not in hand." };
    const card = player.hand[cardIdx];
    if (!isCardDead(this.board, card, player.id)) return { valid: false, reason: "That card can still be played." };

    player.hand.splice(cardIdx, 1);
    this.pushLog(`${player.name} discarded a dead card (${this.cardLabel(card)}).`);

    this.emptyHandStreak = 0;
    this.drawReplacement(player);
    this.advanceTurn();
    this.emit();
    return { valid: true };
  }

  drawReplacement(player) {
    const card = this.deck.pop();
    if (card) player.hand.push(card);
  }

  advanceTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.numPlayers;
    if (this.currentPlayer.hand.length === 0) {
      this.pushLog(`${this.currentPlayer.name} has no cards left and is skipped.`);
      this.emptyHandStreak++;
      if (this.emptyHandStreak >= this.numPlayers) {
        this.gameOver = true;
        this.winnerId = null;
        this.pushLog("No cards remain and no one can complete a sequence. It's a draw.");
        return;
      }
      this.advanceTurn();
    }
  }
}
