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

export function recordPlay({ gameSlug, score, result, details }) {
  return request("/api/plays", {
    method: "POST",
    body: JSON.stringify({ gameSlug, score, result, details }),
  });
}

export function getMyStats({ gameSlug, limit } = {}) {
  const params = new URLSearchParams();
  if (gameSlug) params.set("gameSlug", gameSlug);
  if (limit) params.set("limit", limit);
  const qs = params.toString();
  return request(`/api/stats/me${qs ? `?${qs}` : ""}`).then((body) => body.plays);
}

export function getLeaderboard(gameSlug, { limit, order } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", limit);
  if (order) params.set("order", order);
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
