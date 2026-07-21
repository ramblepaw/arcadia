const TIMEOUT_MS = 8000;
const BASE = "/api/pokemon-breeder";

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...options,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      // no/invalid JSON body
    }
    if (!res.ok) {
      const error = new Error((body && body.error) || `Request failed (${res.status})`);
      error.status = res.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export const getState = () => request("/state");
export const move = (region, x, y) => request("/move", { method: "POST", body: JSON.stringify({ region, x, y }) });
export const interact = (region, x, y) => request("/interact", { method: "POST", body: JSON.stringify({ region, x, y }) });

export const buildPen = (biome) => request("/pens", { method: "POST", body: JSON.stringify({ biome }) });
export const assignToPen = (penId, pokemonId) =>
  request(`/pens/${penId}/assign`, { method: "POST", body: JSON.stringify({ pokemonId }) });
export const unassignFromPen = (penId, pokemonId) =>
  request(`/pens/${penId}/unassign`, { method: "POST", body: JSON.stringify({ pokemonId }) });

export const feedPokemon = (id) => request(`/pokemon/${id}/feed`, { method: "POST" });
export const setHoldItem = (id, item) =>
  request(`/pokemon/${id}/hold-item`, { method: "POST", body: JSON.stringify({ item }) });
export const setDisplay = (id, onDisplay) =>
  request(`/pokemon/${id}/display`, { method: "POST", body: JSON.stringify({ onDisplay }) });
export const sellPokemon = (id) => request(`/pokemon/${id}/sell`, { method: "POST" });

export const getShop = () => request("/shop").then((b) => b.listings);
export const buyListing = (id) => request(`/shop/${id}/buy`, { method: "POST" });

export const getRequests = () => request("/requests").then((b) => b.requests);
export const fulfillRequest = (id, pokemonId) =>
  request(`/requests/${id}/fulfill`, { method: "POST", body: JSON.stringify({ pokemonId }) });

export const getZoos = () => request("/zoos").then((b) => b.zoos);
export const getZoo = (username) => request(`/zoos/${encodeURIComponent(username)}`);

export const getTilesets = () => request("/dev/tilesets").then((b) => b.tilesets);
export const getAllRegions = () => request("/dev/regions").then((b) => b.regions);
export const saveRegion = (slug, region) =>
  request(`/dev/regions/${encodeURIComponent(slug)}`, { method: "POST", body: JSON.stringify(region) });
