// Loads the hand-authored (committed) region tilemaps shared by the
// frontend (rendering) and backend (validating interactions), plus the
// tileset resource library the map editor draws its palette from. Same
// committed-config pattern used elsewhere in this game.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const gameDir = path.join(repoRoot, "games", "pokemon-breeder");
const regionsPath = path.join(gameDir, "config", "regions.json");
const tileSetsDir = path.join(gameDir, "resources", "tile_sets");

let cached = null;

export function loadRegions() {
  if (!cached) {
    cached = JSON.parse(fs.readFileSync(regionsPath, "utf8")).regions;
  }
  return cached;
}

export function getRegion(slug) {
  return loadRegions()[slug] || null;
}

// Returns the full legend entry ({tileset, tx, ty, blocking, resource}) for
// the tile at (x, y), or null if out of bounds / unset.
export function tileAt(regionSlug, x, y) {
  const region = getRegion(regionSlug);
  if (!region) return null;
  if (x < 0 || y < 0 || x >= region.width || y >= region.height) return null;
  const ch = region.rows[y]?.[x];
  return ch ? region.legend[ch] || null : null;
}

export function isBlocking(tileEntry) {
  return Boolean(tileEntry && tileEntry.blocking);
}

export function isResource(tileEntry) {
  return Boolean(tileEntry && tileEntry.resource);
}

export function isInBounds(regionSlug, x, y) {
  const region = getRegion(regionSlug);
  if (!region) return false;
  return x >= 0 && y >= 0 && x < region.width && y < region.height;
}

// --- map editor support -----------------------------------------------

export function saveRegion(slug, regionData) {
  const regions = loadRegions();
  regions[slug] = regionData;
  fs.writeFileSync(regionsPath, JSON.stringify({ regions }, null, 2));
  cached = regions;
}

function pngSize(filePath) {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(24);
  fs.readSync(fd, buf, 0, 24, 0);
  fs.closeSync(fd);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function listTilesets() {
  const results = [];
  function walk(dir, relPrefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.name.toLowerCase().endsWith(".png")) {
        try {
          const { width, height } = pngSize(full);
          results.push({ name: rel, width, height, cols: Math.floor(width / 32), rows: Math.floor(height / 32) });
        } catch {
          // unreadable/corrupt image - skip
        }
      }
    }
  }
  if (fs.existsSync(tileSetsDir)) walk(tileSetsDir, "");
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}
