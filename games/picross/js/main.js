import { MosaicSession } from "./session.js";
import { MOSAICS } from "./mosaics.js";
import * as ui from "./ui.js";
import { getMe, recordPlay, trackAbandonment } from "/api-client.js";

let session = null;
let timerInterval = null;

async function reportMosaicComplete(finishedSession) {
  try {
    const me = await getMe();
    if (!me) return; // guest - nothing to record

    await recordPlay({
      gameSlug: "picross",
      score: finishedSession.elapsedSeconds(),
      result: "win",
      details: {
        mosaic: finishedSession.mosaic.slug,
        totalPanels: finishedSession.totalPanels,
        panelSize: finishedSession.mosaic.panelSize,
      },
    });
  } catch (err) {
    console.warn("[picross] could not record game result:", err);
  }
}

trackAbandonment("picross", () => {
  if (!session || session.isComplete || !session.startTime) return null;
  return {
    score: session.elapsedSeconds(),
    details: {
      mosaic: session.mosaic.slug,
      solvedPanels: session.solvedCount,
      totalPanels: session.totalPanels,
    },
  };
});

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimerLoop() {
  stopTimer();
  timerInterval = setInterval(() => {
    if (!session || session.isComplete) {
      stopTimer();
      return;
    }
    ui.updateTimerDisplays(session);
  }, 1000);
}

function showOverviewScreen() {
  document.getElementById("panel-view").classList.add("hidden");
  document.getElementById("overview-view").classList.remove("hidden");
}

function showPanelScreen() {
  document.getElementById("overview-view").classList.add("hidden");
  document.getElementById("panel-view").classList.remove("hidden");
}

function render() {
  if (session.startTime && !session.isComplete && !timerInterval) {
    startTimerLoop();
  }

  if (session.view === "overview") {
    showOverviewScreen();
    ui.renderOverview(session, {
      onOpenPanel: (pr, pc) => session.openPanel(pr, pc),
    });

    if (session.isComplete) {
      stopTimer();
      ui.updateTimerDisplays(session);
      const modal = document.getElementById("mosaic-complete-modal");
      if (modal.classList.contains("hidden")) {
        ui.showMosaicCompleteModal(session);
        reportMosaicComplete(session);
      }
    }
    return;
  }

  const panelGame = session.currentPanelGame();
  if (panelGame.solved) {
    session.showOverview(); // re-emits, which re-enters render() on the overview branch
    return;
  }

  showPanelScreen();
  ui.renderPanel(session, {
    onCellClick: (r, c) => panelGame.paintCell(r, c),
    onToggleMark: (r, c) => panelGame.toggleMark(r, c),
  });
}

function startMosaic(slug) {
  stopTimer();
  session = new MosaicSession(slug);
  session.subscribe(render);
  document.getElementById("start-screen").classList.add("hidden");
  document.getElementById("mosaic-complete-modal").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  render();
}

function buildMosaicList() {
  const list = document.getElementById("mosaic-list");
  MOSAICS.forEach((mosaic) => {
    const btn = document.createElement("button");
    btn.className = "difficulty-btn";
    btn.dataset.mosaic = mosaic.slug;
    const panelCount = mosaic.panelRows * mosaic.panelCols;
    btn.innerHTML = `${mosaic.title} <span>${mosaic.rows}&times;${mosaic.cols} &middot; ${panelCount} panels</span>`;
    btn.addEventListener("click", () => startMosaic(mosaic.slug));
    list.appendChild(btn);
  });
}

buildMosaicList();

document.getElementById("rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.remove("hidden");
});

document.getElementById("close-rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.add("hidden");
});

document.getElementById("play-again-btn").addEventListener("click", () => {
  startMosaic(session.mosaic.slug);
});

document.getElementById("mark-mode-btn").addEventListener("click", () => {
  session.currentPanelGame().toggleMarkMode();
});

document.getElementById("back-to-overview-btn").addEventListener("click", () => {
  session.showOverview();
});

document.getElementById("reset-panel-btn").addEventListener("click", () => {
  const { pr, pc } = session.view;
  session.panelGames[pr][pc] = null;
  session.openPanel(pr, pc);
});

document.getElementById("reset-mosaic-btn").addEventListener("click", () => {
  const midGame = session && session.startTime && !session.isComplete;
  if (midGame && !confirm("Restart this mosaic? All panel progress will be lost.")) return;
  startMosaic(session.mosaic.slug);
});

document.querySelectorAll(".main-menu-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const midGame = session && session.startTime && !session.isComplete;
    if (midGame && !confirm("Leave this mosaic in progress? Your current progress will be lost.")) {
      return;
    }
    location.href = "../../index.html";
  });
});
