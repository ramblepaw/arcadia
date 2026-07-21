export const BIOME_LABELS = {
  grassland: "Grassland",
  forest: "Forest",
  water: "Water",
  mountain: "Mountain",
  desert: "Desert",
  urban: "Urban",
};

export const HELD_ITEM_LABELS = {
  everstone: "Everstone",
  "destiny-knot": "Destiny Knot",
};

export function ivTotal(ivs) {
  return ivs.hp + ivs.atk + ivs.def + ivs.spa + ivs.spd + ivs.spe;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// actions: array of { action, label, cls } - rendered as buttons with
// data-action/data-id, wired up by the panel's delegated click handler.
// extra: optional held-item <select>, only meaningful for owned instances.
export function pokemonCard(p, { actions = [], showHeldItem = false, inventory = {} } = {}) {
  const ivs = ivTotal(p.ivs);
  const happinessClass = p.eligible ? "eligible" : "";
  const heldItemSelect = showHeldItem
    ? `<select data-hold-item="${p.id}">
        <option value="" ${!p.heldItem ? "selected" : ""}>No item</option>
        <option value="everstone" ${p.heldItem === "everstone" ? "selected" : ""} ${!inventory.everstone && p.heldItem !== "everstone" ? "disabled" : ""}>Everstone (${inventory.everstone || 0})</option>
        <option value="destiny-knot" ${p.heldItem === "destiny-knot" ? "selected" : ""} ${!inventory["destiny-knot"] && p.heldItem !== "destiny-knot" ? "disabled" : ""}>Destiny Knot (${inventory["destiny-knot"] || 0})</option>
      </select>`
    : p.heldItem
      ? `<div class="meta">${HELD_ITEM_LABELS[p.heldItem]}</div>`
      : "";

  return `
    <div class="pokemon-card ${p.isShiny ? "shiny" : ""}">
      ${p.onDisplay ? '<span class="on-display-flag" title="On display in your zoo">★</span>' : ""}
      <img src="${p.sprite}" alt="${escapeHtml(p.name)}" loading="lazy">
      <div class="name">${escapeHtml(p.name)}${p.isShiny ? ' <span class="shiny-tag">✨</span>' : ""}</div>
      <div class="meta">${p.gender} &middot; ${p.nature}</div>
      <div class="meta">IV ${ivs}/186</div>
      <div class="bar"><div class="bar-fill ${happinessClass}" style="width:${p.happiness}%"></div></div>
      <div class="meta">${p.happiness}/100 happiness${p.eligible ? " (ready)" : ""}</div>
      ${heldItemSelect}
      <div class="actions">
        ${actions.map((a) => `<button data-action="${a.action}" data-id="${p.id}" class="${a.cls || ""}">${a.label}</button>`).join("")}
      </div>
    </div>
  `;
}

export function eggCard(egg) {
  const pct = Math.min(100, Math.round((egg.progressSteps / egg.stepsRequired) * 100));
  return `
    <div class="pokemon-card">
      <div class="egg-icon">\u{1F95A}</div>
      <div class="name">Egg</div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="meta">${pct}% incubated</div>
    </div>
  `;
}
