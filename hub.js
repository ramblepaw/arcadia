import { GAMES } from "./games.js";

const grid = document.getElementById("game-grid");

GAMES.forEach((game) => {
  const card = document.createElement("a");
  card.className = "game-card";
  card.href = game.path;
  card.style.setProperty("--accent", game.accent || "#e8c14a");
  card.innerHTML = `
    ${game.icon ? `<div class="game-icon">${game.icon}</div>` : ""}
    <h2>${game.title}</h2>
    <p>${game.tagline}</p>
    <span class="play-hint">Play &rarr;</span>
  `;
  grid.appendChild(card);
});
