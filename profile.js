import { getMe, getMyStats, getLeaderboard } from "./api-client.js";
import { GAMES } from "./games.js";

function gameTitle(slug) {
  const g = GAMES.find((g) => g.slug === slug);
  return g ? g.title : slug;
}

function renderStatsTable(plays) {
  const wrap = document.getElementById("stats-table-wrap");
  if (plays.length === 0) {
    wrap.innerHTML = '<div class="empty-state">You haven\'t played anything yet.</div>';
    return;
  }
  const table = document.createElement("table");
  table.className = "data-table";
  table.innerHTML = "<tr><th>Game</th><th>Score</th><th>Result</th><th>When</th></tr>";
  plays.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${gameTitle(p.gameSlug)}</td>
      <td>${p.score}</td>
      <td>${p.result || "-"}</td>
      <td>${new Date(p.playedAt + "Z").toLocaleString()}</td>
    `;
    table.appendChild(tr);
  });
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

async function renderLeaderboards() {
  const container = document.getElementById("leaderboards");
  for (const game of GAMES) {
    const card = document.createElement("div");
    card.className = "account-card";
    card.innerHTML = `<h2>${game.title} Leaderboard</h2><div class="empty-state">Loading...</div>`;
    container.appendChild(card);

    try {
      const board = await getLeaderboard(game.slug, { order: game.scoreDirection, limit: 10 });
      const body = card.querySelector("div");
      if (board.length === 0) {
        body.textContent = "No scores recorded yet.";
        continue;
      }
      const table = document.createElement("table");
      table.className = "data-table";
      table.innerHTML = "<tr><th>#</th><th>Player</th><th>Best Score</th><th>Plays</th></tr>";
      board.forEach((row, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${i + 1}</td><td>${row.username}</td><td>${row.bestScore}</td><td>${row.playCount}</td>`;
        table.appendChild(tr);
      });
      body.replaceWith(table);
    } catch (err) {
      card.querySelector("div").textContent = "Could not load leaderboard.";
    }
  }
}

async function init() {
  const me = await getMe();
  if (!me) {
    document.getElementById("signed-out").classList.remove("hidden");
    return;
  }

  document.getElementById("profile-heading").textContent = `${me.username}'s Profile`;
  document.getElementById("profile-content").classList.remove("hidden");

  const plays = await getMyStats({ limit: 50 });
  renderStatsTable(plays);
  await renderLeaderboards();
}

init();
