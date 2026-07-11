import { Router } from "express";
import { db } from "../db.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { validateUsername, validatePassword, validateEmail } from "../lib/validate.js";
import {
  createSession,
  destroySession,
  destroyOtherSessions,
  setSessionCookie,
  clearSessionCookie,
  getSessionTokenFromReq,
} from "../lib/sessions.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const authRouter = Router();

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, status: user.status };
}

authRouter.post("/register", authRateLimit, async (req, res) => {
  const { username, password, email } = req.body || {};
  const usernameErr = validateUsername(username);
  if (usernameErr) return res.status(400).json({ error: usernameErr });
  const passwordErr = validatePassword(password);
  if (passwordErr) return res.status(400).json({ error: passwordErr });
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(409).json({ error: "Username already taken." });

  try {
    const passwordHash = await hashPassword(password);
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role, status)
      VALUES (?, ?, ?, 'user', 'pending')
    `).run(username, email || null, passwordHash);
    res.status(201).json({ message: "Account created. An admin needs to approve it before you can log in." });
  } catch (err) {
    console.error("[auth] register error", err);
    res.status(500).json({ error: "Could not create account." });
  }
});

authRouter.post("/login", authRateLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Invalid username or password." });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  try {
    const ok = await verifyPassword(user.password_hash, password);
    if (!ok) return res.status(401).json({ error: "Invalid username or password." });

    if (user.status === "pending") {
      return res.status(403).json({ error: "Your account is awaiting admin approval." });
    }
    if (user.status === "rejected") {
      return res.status(403).json({ error: "Your account request was not approved." });
    }

    const { token, expiresAt } = createSession(user.id, {
      userAgent: req.get("user-agent"),
      ip: req.ip,
    });
    setSessionCookie(req, res, token, expiresAt);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error("[auth] login error", err);
    res.status(500).json({ error: "Login failed." });
  }
});

authRouter.post("/logout", (req, res) => {
  destroySession(getSessionTokenFromReq(req));
  clearSessionCookie(res);
  res.json({ message: "Logged out." });
});

authRouter.get("/me", (req, res) => {
  if (!req.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: publicUser(req.user) });
});

authRouter.post("/change-password", authRateLimit, requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== "string") {
    return res.status(400).json({ error: "Current password is required." });
  }
  const passwordErr = validatePassword(newPassword);
  if (passwordErr) return res.status(400).json({ error: passwordErr });

  try {
    const ok = await verifyPassword(req.user.password_hash, currentPassword);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect." });

    const newHash = await hashPassword(newPassword);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, req.user.id);
    destroyOtherSessions(req.user.id, req.sessionToken);

    res.json({ message: "Password changed." });
  } catch (err) {
    console.error("[auth] change-password error", err);
    res.status(500).json({ error: "Could not change password." });
  }
});
