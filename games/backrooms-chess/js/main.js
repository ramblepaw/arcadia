import { initBackroomsChess } from "./game.js";
import { getMe, recordPlay, trackAbandonment } from "/api-client.js";

async function reportGameResult({ score, movesCount, levelsTraveled, boardSize }) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    await recordPlay({
      gameSlug: "backrooms-chess",
      score,
      result: "loss",
      details: { movesCount, levelsTraveled, boardSize },
    });
  } catch (err) {
    console.warn("[backrooms-chess] could not record game result:", err);
  }
}

const game = initBackroomsChess({ onGameOver: reportGameResult });

trackAbandonment("backrooms-chess", () => {
  const state = game.getUnfinishedState();
  if (!state) return null;
  return {
    score: state.score,
    details: {
      movesCount: state.movesCount,
      levelsTraveled: state.levelsTraveled,
      boardSize: state.boardSize,
    },
  };
});
