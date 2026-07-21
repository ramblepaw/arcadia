import { pokemonCard, eggCard, BIOME_LABELS } from "./render.js";

export function renderRanch(container, ctx) {
  const { state } = ctx;
  const pensHtml = state.pens.map((pen) => {
    const slots = [0, 1].map((slot) => {
      const occupant = pen.occupants[slot];
      if (occupant) {
        return `<div data-pen="${pen.id}">${pokemonCard(occupant, {
          showHeldItem: true,
          inventory: state.inventory,
          actions: [
            { action: "feed", label: "Feed (50g)" },
            { action: "return", label: "Return to Box" },
          ],
        })}</div>`;
      }
      return `<div class="pen-slot" data-pen="${pen.id}">
        <p class="meta">Empty slot</p>
        <button data-action="open-assign" data-pen="${pen.id}">+ Assign</button>
      </div>`;
    });

    return `
      <div class="pen-card">
        <h4>${BIOME_LABELS[pen.biome] || pen.biome} Pen</h4>
        <div class="pen-slots">${slots.join("")}</div>
        ${pen.egg ? `<div class="egg-progress">${eggCard(pen.egg)}</div>` : ""}
      </div>
    `;
  }).join("");

  const biomeOptions = Object.entries(BIOME_LABELS)
    .map(([slug, label]) => `<option value="${slug}">${label}</option>`)
    .join("");

  container.innerHTML = `
    <div class="section-block">
      <h2 class="section-title">Your Ranch</h2>
      <div class="pen-grid">${pensHtml || "<p>No pens yet.</p>"}</div>
      <div class="build-pen-form">
        <select id="new-pen-biome">${biomeOptions}</select>
        <button id="build-pen-btn">Build Pen (${state.nextPenCost}g)</button>
      </div>
    </div>
  `;

  container.onclick = async (e) => {
    const feedBtn = e.target.closest('[data-action="feed"]');
    if (feedBtn) {
      try {
        await ctx.api.feedPokemon(Number(feedBtn.dataset.id));
        await ctx.refresh();
      } catch (err) {
        ctx.toast(err.message);
      }
      return;
    }
    const returnBtn = e.target.closest('[data-action="return"]');
    if (returnBtn) {
      const penId = Number(returnBtn.closest("[data-pen]").dataset.pen);
      try {
        await ctx.api.unassignFromPen(penId, Number(returnBtn.dataset.id));
        await ctx.refresh();
      } catch (err) {
        ctx.toast(err.message);
      }
      return;
    }
    const assignBtn = e.target.closest('[data-action="open-assign"]');
    if (assignBtn) {
      const penId = Number(assignBtn.dataset.pen);
      const pen = state.pens.find((p) => p.id === penId);
      const eligibleBox = state.box.filter((p) => p.biome === pen.biome && !p.currentPenId);
      ctx.openPicker(
        `Assign to ${BIOME_LABELS[pen.biome]} Pen`,
        eligibleBox.map((p) => ({ id: p.id, html: pokemonCard(p) })),
        async (pokemonId) => {
          try {
            await ctx.api.assignToPen(penId, pokemonId);
            await ctx.refresh();
          } catch (err) {
            ctx.toast(err.message);
          }
        },
        eligibleBox.length ? "" : "No Pokemon in your box match this pen's habitat."
      );
      return;
    }
    const buildBtn = e.target.closest("#build-pen-btn");
    if (buildBtn) {
      const biome = container.querySelector("#new-pen-biome").value;
      try {
        await ctx.api.buildPen(biome);
        await ctx.refresh();
      } catch (err) {
        ctx.toast(err.message);
      }
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
