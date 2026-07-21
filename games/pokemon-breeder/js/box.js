import { pokemonCard } from "./render.js";

export function renderBox(container, ctx) {
  const { state } = ctx;

  container.innerHTML = `
    <div class="section-block">
      <h2 class="section-title">Box (${state.box.length})</h2>
      <div class="pokemon-grid">
        ${state.box.map((p) => pokemonCard(p, {
          showHeldItem: true,
          inventory: state.inventory,
          actions: [
            { action: "display", label: p.onDisplay ? "Remove from Zoo" : "Display in Zoo" },
            { action: "sell", label: "Sell", cls: "danger" },
          ],
        })).join("") || "<p>Your box is empty - explore the World or check the Market.</p>"}
      </div>
    </div>
  `;

  container.onclick = async (e) => {
    const displayBtn = e.target.closest('[data-action="display"]');
    if (displayBtn) {
      const id = Number(displayBtn.dataset.id);
      const p = state.box.find((x) => x.id === id);
      try {
        await ctx.api.setDisplay(id, !p.onDisplay);
        await ctx.refresh();
      } catch (err) {
        ctx.toast(err.message);
      }
      return;
    }
    const sellBtn = e.target.closest('[data-action="sell"]');
    if (sellBtn) {
      const id = Number(sellBtn.dataset.id);
      ctx.openConfirm("Sell this Pokemon? This can't be undone.", async () => {
        try {
          const result = await ctx.api.sellPokemon(id);
          ctx.toast(`Sold for ${result.soldFor}g`);
          await ctx.refresh();
        } catch (err) {
          ctx.toast(err.message);
        }
      });
    }
  };

  container.onchange = async (e) => {
    const select = e.target.closest("[data-hold-item]");
    if (select) {
      try {
        await ctx.api.setHoldItem(Number(select.dataset.holdItem), select.value || null);
        await ctx.refresh();
      } catch (err) {
        ctx.toast(err.message);
      }
    }
  };
}
