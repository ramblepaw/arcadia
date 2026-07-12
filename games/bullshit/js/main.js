import { Game } from "./game.js";
import { choosePlay, decideChallenge } from "./bot.js";
import * as ui from "./ui.js";
import { getMe, recordPlay } from "/api-client.js";

const BOT_STEP_DELAY = 1100;

let game = null;
let botTimer = null;

function render() {
  ui.renderAll(game, {
    onRerender: render,
    onCallBullshit: () => { game.callBullshit(0); },
    onPassChallenge: () => { game.passChallenge(0); },
  });
}

async function reportGameResult(finishedGame) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    const human = finishedGame.players.find((p) => p.isHuman);
    const result = human.finishRank === finishedGame.numPlayers ? "loss" : "win";

    await recordPlay({
      gameSlug: "bullshit",
      score: human.finishRank,
      result,
      details: { numPlayers: finishedGame.numPlayers, finishRank: human.finishRank },
    });
  } catch (err) {
    console.warn("[bullshit] could not record game result:", err);
  }
}

function onStateChange() {
  render();

  if (game.isGameOver) {
    if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    const modal = document.getElementById("game-over-modal");
    if (modal.classList.contains("hidden")) {
      ui.showGameOverModal(game);
      reportGameResult(game);
    }
    return;
  }

  if (game.pendingPlay) {
    const challenger = game.nextChallenger();
    if (challenger !== 0) scheduleBotChallengeStep();
    return;
  }

  if (!game.currentPlayer.isHuman) scheduleBotPlayStep();
}

function scheduleBotChallengeStep() {
  if (botTimer) clearTimeout(botTimer);
  botTimer = setTimeout(runBotChallengeStep, BOT_STEP_DELAY);
}

function scheduleBotPlayStep() {
  if (botTimer) clearTimeout(botTimer);
  botTimer = setTimeout(runBotPlayStep, BOT_STEP_DELAY);
}

function runBotChallengeStep() {
  botTimer = null;
  if (game.isGameOver || !game.pendingPlay) return;
  const idx = game.nextChallenger();
  if (idx === null || idx === 0) return;

  const bot = game.players[idx];
  const { playerIdx, claimedRank, cards } = game.pendingPlay;
  const decision = decideChallenge(bot.hand, {
    claimedRank,
    claimedCount: cards.length,
    playerHandSizeAfterPlay: game.players[playerIdx].hand.length,
    pileSize: game.pile.length,
  });

  if (decision) game.callBullshit(idx);
  else game.passChallenge(idx);
}

function runBotPlayStep() {
  botTimer = null;
  if (game.isGameOver || game.pendingPlay || game.currentPlayer.isHuman) return;

  const idx = game.currentPlayerIndex;
  const bot = game.players[idx];
  const cardIds = choosePlay(bot.hand, game.requiredRank());
  game.playCards(idx, cardIds);
}

function startGame(numBots) {
  game = new Game(numBots);
  game.subscribe(onStateChange);
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  onStateChange();
}

document.getElementById("start-btn").addEventListener("click", () => {
  const numBots = parseInt(document.getElementById("bot-count").value, 10);
  startGame(numBots);
});

document.getElementById("rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.remove("hidden");
});

document.getElementById("close-rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.add("hidden");
});

document.getElementById("sort-rank-btn").addEventListener("click", () => {
  ui.sortHandByRank(game);
  render();
});

document.getElementById("play-btn").addEventListener("click", () => {
  const ids = ui.getSelectedCardIds();
  const result = game.playCards(0, ids);
  if (result.valid) ui.resetSelection();
});

document.getElementById("play-again-btn").addEventListener("click", () => {
  location.reload();
});

document.getElementById("main-menu-btn").addEventListener("click", () => {
  const midGame = game && !game.isGameOver;
  if (midGame && !confirm("Leave this game in progress? Your current game will be lost.")) {
    return;
  }
  location.href = "../../index.html";
});
