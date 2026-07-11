import crypto from "node:crypto";
import { db } from "../db.js";

export const SESSION_COOKIE = "sid";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createSession(userId, { userAgent, ip } = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, user_agent, ip)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, userId, expiresAt, userAgent || null, ip || null);
  return { token, expiresAt };
}

export function getSessionUser(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > datetime('now')
  `).get(token);
  return row || null;
}

export function destroySession(token) {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
}

export function getSessionTokenFromReq(req) {
  return (req.cookies && req.cookies[SESSION_COOKIE]) || null;
}

export function setSessionCookie(req, res, token, expiresAt) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    expires: new Date(expiresAt),
    path: "/",
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
