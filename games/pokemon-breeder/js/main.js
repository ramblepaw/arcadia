import { getMe } from "/api-client.js";
import * as api from "./api.js";
import { renderRanch } from "./ranch.js";
import { renderBox } from "./box.js";
import { renderMarket } from "./market.js";
import { renderZoo } from "./zoo.js";
import { renderWorld } from "./world.js";
import { escapeHtml, BIOME_LABELS } from "./render.js";

const POLL_MS = 30000;

let state = null;
let locations = [];
let activeTab = "ranch";

const panels = {
  ranch: { el: document.getElementById("panel-ranch"), render: renderRanch },
  box: { el: document.getElementById("panel-box"), render: renderBox },
  market: { el: document.getElementById("panel-market"), render: renderMarket },
  zoo: { el: document.getElementById("panel-zoo"), render: renderZoo },
  world: { el: document.getElementById("panel-world"), render: renderWorld },
};

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.add("hidden"), 3500);
}

function openPicker(title, items, onPick, emptyMessage) {
  const modal = document.getElementById("picker-modal");
  document.getElementById("picker-title").textContent = title;
  const list = document.getElementById("picker-list");
  list.innerHTML = items.length ? items.map((it) => `<div data-pick="${it.id}">${it.html}</div>`).join("") : `<p>${escapeHtml(emptyMessage || "Nothing available.")}</p>`;
  modal.classList.remove("hidden");

  list.onclick = (e) => {
    const target = e.target.closest("[data-pick]");
    if (!target) return;
    modal.classList.add("hidden");
    onPick(Number(target.dataset.pick));
  };
}

document.getElementById("picker-close-btn").addEventListener("click", () => {
  document.getElementById("picker-modal").classList.add("hidden");
});

function openConfirm(message, onConfirm) {
  const modal = document.getElementById("confirm-modal");
  document.getElementById("confirm-message").textContent = message;
  modal.classList.remove("hidden");

  const cleanup = () => modal.classList.add("hidden");
  document.getElementById("confirm-ok-btn").onclick = () => {
    cleanup();
    onConfirm();
  };
  document.getElementById("confirm-cancel-btn").onclick = cleanup;
}

function ctx() {
  return { state, locations, api, refresh, toast, openPicker, openConfirm };
}

function renderHeader() {
  document.getElementById("currency-badge").textContent = `${state.currency}g`;
  const loc = locations.find((l) => l.slug === state.currentLocation);
  document.getElementById("location-badge").textContent = loc ? `${BIOME_LABELS[loc.biome] || loc.biome}: ${loc.name}` : state.currentLocation;

  document.getElementById("events-list").innerHTML = state.recentEvents
    .map((e) => `<li>${escapeHtml(e.text)}</li>`)
    .join("") || "<li>Nothing yet.</li>";
}

async function renderAllPanels() {
  for (const [name, panel] of Object.entries(panels)) {
    await panel.render(panel.el, ctx());
  }
}

async function refresh() {
  try {
    state = await api.getState();
  } catch (err) {
    toast(err.message);
    return;
  }
  renderHeader();
  await renderAllPanels();
}

function switchTab(tab) {
  activeTab = tab;
  for (const [name, panel] of Object.entries(panels)) {
    panel.el.classList.toggle("hidden", name !== tab);
  }
  for (const btn of document.querySelectorAll(".tab-btn")) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

async function boot() {
  const me = await getMe().catch(() => null);
  if (!me) {
    document.getElementById("login-required-screen").classList.remove("hidden");
    return;
  }

  try {
    locations = await api.getLocations();
    state = await api.getState();
  } catch (err) {
    if (err.status === 503) {
      document.getElementById("dex-not-ready-screen").classList.remove("hidden");
      return;
    }
    toast(err.message);
    document.getElementById("dex-not-ready-screen").classList.remove("hidden");
    return;
  }

  document.getElementById("app").classList.remove("hidden");
  switchTab(activeTab);
  renderHeader();
  await renderAllPanels();

  setInterval(refresh, POLL_MS);
}

boot();
