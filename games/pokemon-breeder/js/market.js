import { pokemonCard, escapeHtml } from "./render.js";

function criteriaText(c) {
  const parts = [];
  if (c.shinyRequired) parts.push("Shiny");
  if (c.genderRequired) parts.push(c.genderRequired);
  if (c.natureRequired) parts.push(`${c.natureRequired} nature`);
  if (c.minIvTotal) parts.push(`IV total ${c.minIvTotal}+`);
  return parts.length ? parts.join(", ") : "Any stats";
}

export async function renderMarket(container, ctx) {
  container.innerHTML = "<p>Loading market...</p>";
  let shop, requests;
  try {
    [shop, requests] = await Promise.all([ctx.api.getShop(), ctx.api.getRequests()]);
  } catch (err) {
    container.innerHTML = `<p>Could not load the market: ${escapeHtml(err.message)}</p>`;
    return;
  }

  const shopHtml = shop.map((l) => `
    <div class="shop-card">
      <img src="${l.sprite}" alt="${escapeHtml(l.name)}">
      <div style="flex:1">
        <div class="name">${escapeHtml(l.name)}${l.isShiny ? " ✨" : ""}</div>
        <div class="meta">${l.gender} &middot; ${l.nature}</div>
      </div>
      <button data-action="buy" data-id="${l.id}">Buy (${l.price}g)</button>
    </div>
  `).join("") || "<p>The shop is empty right now.</p>";

  const requestsHtml = requests.map((r) => `
    <div class="request-card">
      <img src="${r.sprite}" alt="${escapeHtml(r.name)}">
      <div style="flex:1">
        <div class="name">${escapeHtml(r.name)}</div>
        <div class="criteria">${criteriaText(r.criteria)}</div>
      </div>
      <button data-action="fulfill" data-id="${r.id}" data-species="${r.speciesKey}">Fulfill (${r.reward}g)</button>
    </div>
  `).join("") || "<p>No open requests right now.</p>";

  container.innerHTML = `
    <div class="section-block">
      <h2 class="section-title">Shop</h2>
      ${shopHtml}
    </div>
    <div class="section-block">
      <h2 class="section-title">Request Board</h2>
      ${requestsHtml}
    </div>
  `;

  container.onclick = async (e) => {
    const buyBtn = e.target.closest('[data-action="buy"]');
    if (buyBtn) {
      try {
        await ctx.api.buyListing(Number(buyBtn.dataset.id));
        ctx.toast("Purchased!");
        await ctx.refresh();
      } catch (err) {
        ctx.toast(err.message);
      }
      return;
    }
    const fulfillBtn = e.target.closest('[data-action="fulfill"]');
    if (fulfillBtn) {
      const requestId = Number(fulfillBtn.dataset.id);
      const speciesKey = fulfillBtn.dataset.species;
      const candidates = ctx.state.box.filter((p) => p.speciesKey === speciesKey && !p.onDisplay);
      ctx.openPicker(
        "Choose a Pokemon to send",
        candidates.map((p) => ({ id: p.id, html: pokemonCard(p) })),
        async (pokemonId) => {
          try {
            const result = await ctx.api.fulfillRequest(requestId, pokemonId);
            ctx.toast(`Request fulfilled for ${result.reward}g!`);
            await ctx.refresh();
          } catch (err) {
            ctx.toast(err.message);
          }
        },
        candidates.length ? "" : "You don't have a matching Pokemon in your box."
      );
    }
  };
}
