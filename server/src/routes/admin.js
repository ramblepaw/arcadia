import { Router } from "express";
import { db } from "../db.js";
import { hashPassword } from "../lib/password.js";
import { validateUsername, validatePassword, validateEmail } from "../lib/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
  };
}

adminRouter.get("/users", (req, res) => {
  const status = ["pending", "approved", "rejected"].includes(req.query.status)
    ? req.query.status
    : "pending";
  const rows = db
    .prepare("SELECT * FROM users WHERE status = ? ORDER BY created_at ASC")
    .all(status);
  res.json({ users: rows.map(publicUser) });
});

adminRouter.post("/users/:id/approve", (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "User not found." });
  db.prepare(`
    UPDATE users SET status = 'approved', approved_at = datetime('now'), approved_by = ?
    WHERE id = ?
  `).run(req.user.id, id);
  res.json({ message: "User approved." });
});

adminRouter.post("/users/:id/reject", (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "User not found." });
  db.prepare(`
    UPDATE users SET status = 'rejected', approved_at = datetime('now'), approved_by = ?
    WHERE id = ?
  `).run(req.user.id, id);
  res.json({ message: "User rejected." });
});

adminRouter.post("/users", async (req, res) => {
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
    const info = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, status, approved_at, approved_by)
      VALUES (?, ?, ?, 'user', 'approved', datetime('now'), ?)
    `).run(username, email || null, passwordHash, req.user.id);
    res.status(201).json({ message: "User created.", id: info.lastInsertRowid });
  } catch (err) {
    console.error("[admin] create user error", err);
    res.status(500).json({ error: "Could not create account." });
  }
});
