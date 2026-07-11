import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const playsRouter = Router();

const SLUG_RE = /^[a-z0-9-]{1,64}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

playsRouter.post("/plays", requireAuth, (req, res) => {
  const { gameSlug, score, result, details } = req.body || {};
  if (typeof gameSlug !== "string" || !SLUG_RE.test(gameSlug)) {
    return res.status(400).json({ error: "Invalid gameSlug." });
  }
  const scoreNum = Number(score);
  if (!Number.isFinite(scoreNum)) {
    return res.status(400).json({ error: "score must be a number." });
  }
  if (result != null && typeof result !== "string") {
    return res.status(400).json({ error: "result must be a string." });
  }

  let detailsJson = "{}";
  if (details != null) {
    try {
      detailsJson = JSON.stringify(details);
    } catch {
      return res.status(400).json({ error: "details must be JSON-serializable." });
    }
  }

  const info = db.prepare(`
    INSERT INTO plays (user_id, game_slug, score, result, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, gameSlug, scoreNum, result || null, detailsJson);

  res.status(201).json({ id: info.lastInsertRowid });
});

playsRouter.get("/stats/me", requireAuth, (req, res) => {
  const { gameSlug } = req.query;
  const limit = clampLimit(req.query.limit, DEFAULT_LIMIT);

  let rows;
  if (gameSlug) {
    rows = db.prepare(`
      SELECT id, game_slug as gameSlug, played_at as playedAt, score, result, details
      FROM plays WHERE user_id = ? AND game_slug = ?
      ORDER BY played_at DESC LIMIT ?
    `).all(req.user.id, gameSlug, limit);
  } else {
    rows = db.prepare(`
      SELECT id, game_slug as gameSlug, played_at as playedAt, score, result, details
      FROM plays WHERE user_id = ?
      ORDER BY played_at DESC LIMIT ?
    `).all(req.user.id, limit);
  }

  res.json({
    plays: rows.map((r) => ({ ...r, details: JSON.parse(r.details) })),
  });
});

playsRouter.get("/leaderboard/:gameSlug", (req, res) => {
  const { gameSlug } = req.params;
  if (!SLUG_RE.test(gameSlug)) {
    return res.status(400).json({ error: "Invalid gameSlug." });
  }
  const limit = clampLimit(req.query.limit, 20);
  const order = req.query.order === "desc" ? "DESC" : "ASC";
  const aggregate = order === "DESC" ? "MAX" : "MIN";

  const rows = db.prepare(`
    SELECT users.username AS username,
           ${aggregate}(plays.score) AS bestScore,
           COUNT(*) AS playCount
    FROM plays
    JOIN users ON users.id = plays.user_id
    WHERE plays.game_slug = ?
    GROUP BY plays.user_id
    ORDER BY bestScore ${order}
    LIMIT ?
  `).all(gameSlug, limit);

  res.json({ leaderboard: rows });
});
