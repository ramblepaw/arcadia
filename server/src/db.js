import { DatabaseSync } from "node:sqlite";
import argon2 from "argon2";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "..", process.env.DB_PATH || "../data/games.db");
export const dataDir = path.dirname(dbPath);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// node:sqlite ships with Node 22.5+ - no native module to compile, which
// avoids needing a C++ toolchain both for local dev and in the Docker image.
export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(db.prepare("SELECT filename FROM schema_migrations").all().map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (filename) VALUES (?)").run(file);
    console.log(`[db] applied migration ${file}`);
  }
}

async function seedAdmin() {
  const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existingAdmin) return;

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn(
      "[db] No admin user exists yet and ADMIN_USERNAME/ADMIN_PASSWORD are not set - " +
      "set them and restart to create one. Nobody will be able to approve pending signups until then."
    );
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  db.prepare(`
    INSERT INTO users (username, password_hash, role, status, approved_at)
    VALUES (?, ?, 'admin', 'approved', datetime('now'))
  `).run(username, passwordHash);
  console.log(`[db] seeded admin user "${username}"`);
}

export async function initDb() {
  runMigrations();
  await seedAdmin();
}
