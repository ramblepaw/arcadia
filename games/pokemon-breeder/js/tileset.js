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
