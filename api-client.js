// Thin fetch wrappers shared by every page/game in the hub. Every call is
// same-origin, credentialed (so the session cookie rides along), and time-
// boxed so an unreachable backend can never hang a caller - callers that
// don't care whether the backend is up (e.g. a game reporting a score)
// should always wrap these in try/catch.

const TIMEOUT_MS = 5000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...options,
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      // no/invalid JSON body, leave as null
    }
    if (!res.ok) {
      const error = new Error((body && body.error) || `Request failed (${res.status})`);
      error.status = res.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export function getMe() {
  return request("/api/auth/me").then((body) => (body && body.loggedIn ? body.user : null));
}

export function register({ username, password, email }) {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, email }),
  });
}

export function login({ username, password }) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }).then((body) => body.user);
}

export function logout() {
  return request("/api/auth/logout", { method: "POST" });
}

export function changePassword({ currentPassword, newPassword }) {
  return request("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function recordPlay({ gameSlug, score, result, details }) {
  return request("/api/plays", {
    method: "POST",
    body: JSON.stringify({ gameSlug, score, result, details }),
  });
}

// Without this, a player who's about to lose can just close the tab or
// navigate back to the hub and nothing ever gets recorded - not a loss, not
// anything - so their record stays clean. pagehide fires when the page is
// actually being torn down (navigation, tab close, reload) but NOT on a
// plain tab-switch, so alt-tabbing away from a game in progress doesn't
// falsely record a loss. sendBeacon (rather than fetch) is used because it's
// the one request type browsers guarantee gets sent during page teardown.
//
// gameSlug: this game's slug.
// getUnfinishedState: () => null | { score, details } - called at teardown.
//   Return null once the game has concluded on its own (recordPlay already
//   fired for it) or hasn't started yet; otherwise return the current
//   score/details to report as a loss.
export function trackAbandonment(gameSlug, getUnfinishedState) {
  window.addEventListener("pagehide", () => {
    let state;
    try {
      state = getUnfinishedState();
    } catch {
      return;
    }
    if (!state) return;
    const payload = JSON.stringify({
      gameSlug,
      score: state.score,
      result: "loss",
      details: { ...(state.details || {}), abandoned: true },
    });
    navigator.sendBeacon("/api/plays", new Blob([payload], { type: "application/json" }));
  });
}

export function getMyStats({ gameSlug, limit } = {}) {
  const params = new URLSearchParams();
  if (gameSlug) params.set("gameSlug", gameSlug);
  if (limit) params.set("limit", limit);
  const qs = params.toString();
  return request(`/api/stats/me${qs ? `?${qs}` : ""}`).then((body) => body.plays);
}

export function getLeaderboard(gameSlug, { limit, order, metric } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", limit);
  if (order) params.set("order", order);
  if (metric) params.set("metric", metric);
  const qs = params.toString();
  return request(`/api/leaderboard/${encodeURIComponent(gameSlug)}${qs ? `?${qs}` : ""}`).then(
    (body) => body.leaderboard
  );
}

// --- admin ---

export function adminListUsers(status = "pending") {
  return request(`/api/admin/users?status=${encodeURIComponent(status)}`).then((body) => body.users);
}

export function adminApproveUser(id) {
  return request(`/api/admin/users/${id}/approve`, { method: "POST" });
}

export function adminRejectUser(id) {
  return request(`/api/admin/users/${id}/reject`, { method: "POST" });
}

export function adminCreateUser({ username, password, email }) {
  return request("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({ username, password, email }),
  });
}
