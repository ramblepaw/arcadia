import { escapeHtml, BIOME_LABELS } from "./render.js";

export function renderWorld(container, ctx) {
  const { state, locations } = ctx;

  container.innerHTML = `
    <div class="section-block">
      <h2 class="section-title">Explore</h2>
      <p class="meta">Travel around to find wild Pokemon and breeding items - and to speed up any eggs currently incubating.</p>
      <div class="location-grid">
        ${locations.map((loc) => `
          <div class="location-card ${loc.slug === state.currentLocation ? "current" : ""}">
            <h4>${escapeHtml(loc.name)}</h4>
            <p class="meta">${BIOME_LABELS[loc.biome] || loc.biome}</p>
            <p>${escapeHtml(loc.flavorText)}</p>
            ${loc.slug === state.currentLocation
              ? '<button disabled>Currently Here</button>'
              : `<button data-action="travel" data-slug="${loc.slug}">Travel Here</button>`}
          </div>
        `).join("")}
      </div>
    </div>
  `;

  container.onclick = async (e) => {
    const btn = e.target.closest('[data-action="travel"]');
    if (btn) {
      try {
        await ctx.api.travel(btn.dataset.slug);
        await ctx.refresh();
      } catch (err) {
        ctx.toast(err.message);
      }
    }
  };
}
