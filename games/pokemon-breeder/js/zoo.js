import { pokemonCard, escapeHtml } from "./render.js";

let selectedUsername = null;

function allOwnedPokemon(state) {
  return [...state.box, ...state.pens.flatMap((p) => p.occupants)];
}

export async function renderZoo(container, ctx) {
  const { state } = ctx;
  const myDisplayed = allOwnedPokemon(state).filter((p) => p.onDisplay);

  container.innerHTML = `
    <div class="section-block">
      <h2 class="section-title">Your Zoo</h2>
      <div class="pokemon-grid">
        ${myDisplayed.map((p) => pokemonCard(p)).join("") || "<p>Nothing on display yet - mark a Pokemon 'Display in Zoo' from your Box.</p>"}
      </div>
    </div>
    <div class="section-block">
      <h2 class="section-title">Browse Other Zoos</h2>
      <ul id="zoo-user-list" class="zoo-user-list"><li>Loading...</li></ul>
      <div id="zoo-detail" class="pokemon-grid"></div>
    </div>
  `;

  container.onclick = async (e) => {
    const userItem = e.target.closest("[data-username]");
    if (userItem) {
      selectedUsername = userItem.dataset.username;
      await loadZooDetail(container, ctx);
    }
  };

  try {
    const zoos = await ctx.api.getZoos();
    const list = container.querySelector("#zoo-user-list");
    list.innerHTML = zoos.map((z) => `<li data-username="${escapeHtml(z.username)}">${escapeHtml(z.username)} (${z.displayCount})</li>`).join("")
      || "<li>No one has anything on display yet.</li>";
    if (selectedUsername) await loadZooDetail(container, ctx);
  } catch (err) {
    container.querySelector("#zoo-user-list").innerHTML = `<li>Could not load zoos: ${escapeHtml(err.message)}</li>`;
  }
}

async function loadZooDetail(container, ctx) {
  const detail = container.querySelector("#zoo-detail");
  detail.innerHTML = "<p>Loading...</p>";
  try {
    const zoo = await ctx.api.getZoo(selectedUsername);
    detail.innerHTML = `<h3 style="grid-column:1/-1">${escapeHtml(zoo.username)}'s Zoo</h3>` +
      (zoo.pokemon.map((p) => pokemonCard(p)).join("") || "<p>Nothing on display.</p>");
  } catch (err) {
    detail.innerHTML = `<p>${escapeHtml(err.message)}</p>`;
  }
}
