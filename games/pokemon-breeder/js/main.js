import { getMe } from "/api-client.js";
import * as api from "./api.js";
import { createWorld } from "./world.js";
import { escapeHtml } from "./render.js";

const POLL_MS = 30000;

let state = null;

function toast(message) {
  pushEventRow(message);
}

function pushEventRow(text) {
  const list = document.getElementById("events-list");
  const li = document.createElement("li");
  li.textContent = text;
  list.prepend(li);
  while (list.children.length > 20) list.removeChild(list.lastChild);
}

function renderHeader() {
  document.getElementById("currency-badge").textContent = `${state.currency}g`;
  document.getElementById("region-badge").textContent = state.region;
}

async function refreshState() {
  try {
    state = await api.getState();
  } catch (err) {
    toast(err.message);
    return;
  }
  renderHeader();
}

async function boot() {
  const me = await getMe().catch(() => null);
  if (!me) {
    document.getElementById("login-required-screen").classList.remove("hidden");
    return;
  }

  try {
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
  renderHeader();
  for (const e of (state.recentEvents || []).slice().reverse()) {
    pushEventRow(e.text);
  }

  const canvas = document.getElementById("world-canvas");
  await createWorld(canvas, {
    initialRegion: state.region,
    initialX: state.posX,
    initialY: state.posY,
    api,
    onEvent: (text) => {
      pushEventRow(text);
      refreshState();
    },
  });

  setInterval(refreshState, POLL_MS);
}

boot();
