import { cardTargets, windowsThrough } from "./rules.js";

// Best "line quality" through cellId for ownerId: the most matching cells
// (corner, or chip belonging to ownerId, or cellId itself) found in any
// single 5-cell window through that point. Works both for scoring a
// hypothetical placement (cellId is currently empty) and for scoring an
// existing chip (cellId already belongs to ownerId).
function lineStrength(board, cellId, ownerId) {
  let best = 0;
  for (const cells of windowsThrough(cellId)) {
    let count = 0;
    for (const id of cells) {
      const cell = board[id];
      if (cell.isCorner || id === cellId || cell.chip === ownerId) count++;
    }
    if (count > best) best = count;
  }
  return best;
}

export function decideBotMove(game, idx) {
  const bot = game.players[idx];
  const board = game.board;
  const opponentIds = game.players.filter((p) => p.id !== bot.id).map((p) => p.id);

  let best = null;
  const consider = (action, score) => {
    if (!best || score > best.score) best = { action, score };
  };

  for (const card of bot.hand) {
    const targets = cardTargets(board, card, bot.id);
    if (targets.kind === "place" && targets.cells.length > 0) {
      for (const cellId of targets.cells) {
        let score = (lineStrength(board, cellId, bot.id) ** 3);
        for (const oppId of opponentIds) {
          score += (lineStrength(board, cellId, oppId) ** 3) * 0.9;
        }
        score += Math.random() * 2;
        consider({ type: "place", cardId: card.id, cellId }, score);
      }
    } else if (targets.kind === "remove" && targets.cells.length > 0) {
      for (const cellId of targets.cells) {
        const ownerId = board[cellId].chip;
        const score = (lineStrength(board, cellId, ownerId) ** 3) * 0.95 + Math.random() * 2;
        consider({ type: "remove", cardId: card.id, cellId }, score);
      }
    } else if (targets.kind === "dead") {
      consider({ type: "deadDiscard", cardId: card.id }, -1000 + Math.random());
    }
  }

  return best ? best.action : null;
}
