import { getSessionTokenFromReq, getSessionUser } from "../lib/sessions.js";

/** Populates req.user (or null) from the session cookie. Never blocks the request. */
export function attachUser(req, res, next) {
  const token = getSessionTokenFromReq(req);
  req.sessionToken = token;
  req.user = getSessionUser(token);
  next();
}

/** Blocks the request unless attachUser found a valid, approved session. */
export function requireAuth(req, res, next) {
  if (!req.user || req.user.status !== "approved") {
    return res.status(401).json({ error: "Not authenticated." });
  }
  next();
}
