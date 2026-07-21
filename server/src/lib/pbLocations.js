// Loads the hand-authored (committed) location list shared by the frontend
// and backend - unlike pokedex.json/sprites, this is small and static so it
// lives in the game's own folder rather than the git-ignored data dir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const locationsPath = path.join(repoRoot, "games", "pokemon-breeder", "config", "locations.json");

let cached = null;

export function loadLocations() {
  if (!cached) {
    cached = JSON.parse(fs.readFileSync(locationsPath, "utf8")).locations;
  }
  return cached;
}

export function getLocation(slug) {
  return loadLocations().find((l) => l.slug === slug) || null;
}
