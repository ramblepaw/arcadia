// Loads real tile/character art from games/pokemon-breeder/resources/
// (Pokemon Essentials / RPG Maker XP convention: 32px tile grid, character
// sheets are 4 direction-rows x 4 walk-frame-columns at 64px each). Shared
// between the game (world.js) and the map editor (editor.js).

export const TILE_PX = 32;
export const CHAR_FRAME_PX = 64;
export const DIRECTION_ROW = { down: 0, left: 1, right: 2, up: 3 };

function encodePath(p) {
  return p.split("/").map(encodeURIComponent).join("/");
}

const imageCache = new Map();
function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

export function tilesetUrl(name) {
  return `resources/tile_sets/${encodePath(name)}`;
}

export function characterSheetUrl(relativePath) {
  return `resources/character_customization/${encodePath(relativePath)}`;
}

export function loadTileset(name) {
  return loadImage(tilesetUrl(name));
}

export function loadCharacterSheet(relativePath) {
  return loadImage(characterSheetUrl(relativePath));
}

export function drawTileCell(ctx, img, tx, ty, dx, dy, size) {
  ctx.drawImage(img, tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX, dx, dy, size, size);
}

export function drawCharacterFrame(ctx, img, direction, frame, dx, dy, size) {
  const row = DIRECTION_ROW[direction];
  ctx.drawImage(img, frame * CHAR_FRAME_PX, row * CHAR_FRAME_PX, CHAR_FRAME_PX, CHAR_FRAME_PX, dx, dy, size, size);
}

export function tileCountFor(img) {
  return { cols: Math.floor(img.width / TILE_PX), rows: Math.floor(img.height / TILE_PX) };
}

// The default starter character - a single base body, no customization
// layering yet (hair/tops/bottoms/hats are separate same-grid PNGs meant to
// be composited on top of this - a fast-follow, not wired up yet).
export const DEFAULT_CHARACTER_SHEET = "overworld walk/bases mf/m base light.png";

export const AUTOTILE_FOLDER = "Autotiles/";

// RPG Maker XP-convention autotile sheets are a 3-column x 4-row grid of
// pre-composited 32px tiles; slot (0,0) is an unused placeholder. This maps
// a 4-bit mask of which orthogonal neighbors are OPEN (a different tile, not
// the same autotile) to the [col,row] of the matching pre-composited tile.
// This is a reconstructed best-effort convention, not verified pixel-exact
// against the original RPG Maker engine for every sheet in this pack - if a
// specific shape looks wrong, this table (not the neighbor-detection logic
// below) is almost certainly where to adjust it.
const N = 1, E = 2, S = 4, W = 8;
export const AUTOTILE_TABLE = {
  [N | E | S | W]: [1, 0], // isolated patch, no connections
  [N]: [2, 0],             // connects S only (open on N,E,W)
  [W]: [0, 1],             // connects E only
  0: [1, 1],               // fully interior (all sides connect)
  [E]: [2, 1],             // connects W only
  [S]: [0, 2],             // connects N only
  [N | W]: [1, 2],         // outer corner: connects E+S
  [N | E]: [2, 2],         // outer corner: connects S+W
  [S | W]: [0, 3],         // outer corner: connects N+E
  [S | E]: [1, 3],         // outer corner: connects N+W
};

export function autotilePosition(mask) {
  return AUTOTILE_TABLE[mask] || AUTOTILE_TABLE[0];
}

export function computeAutotileMask(isOpen) {
  let mask = 0;
  if (isOpen(0, -1)) mask |= N;
  if (isOpen(1, 0)) mask |= E;
  if (isOpen(0, 1)) mask |= S;
  if (isOpen(-1, 0)) mask |= W;
  return mask;
}

// A neighbor "connects" to this autotile cell only if it's also an autotile
// cell from the exact same sheet - anything else (ground, a regular tile, a
// different autotile sheet, out of bounds) reads as an open edge.
export function autotileIsOpenNeighbor(neighborEntry, thisEntry) {
  if (!neighborEntry) return true;
  return !(neighborEntry.autotile && neighborEntry.tileset === thisEntry.tileset);
}
