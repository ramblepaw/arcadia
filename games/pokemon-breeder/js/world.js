import { TILE_PX, CHAR_FRAME_PX, loadTileset, loadCharacterSheet, drawTileCell, drawCharacterFrame, DEFAULT_CHARACTER_SHEET, computeAutotileMask, autotilePosition, autotileIsOpenNeighbor } from "./tileset.js";

const SCALE = 2;
const TILE_SIZE = TILE_PX * SCALE;
const CHAR_SIZE = CHAR_FRAME_PX * SCALE;
const STEP_MS = 130;
const VIEWPORT_TILES_W = 15;
const VIEWPORT_TILES_H = 11;

// Movement/exits/regions all speak compass directions; character frames
// speak screen-facing directions - this is the one place they're translated.
const OPPOSITE = { north: "south", south: "north", east: "west", west: "east" };
const DELTA = {
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
};
const FACING = { north: "up", south: "down", east: "right", west: "left" };

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export async function createWorld(canvas, { initialRegion, initialX, initialY, api, onEvent }) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  canvas.width = VIEWPORT_TILES_W * TILE_SIZE;
  canvas.height = VIEWPORT_TILES_H * TILE_SIZE;

  const regionsRes = await fetch("config/regions.json");
  const { regions } = await regionsRes.json();

  // Preload every tileset referenced anywhere in the loaded regions (as
  // resolved Image elements, not promises - drawImage needs the real
  // element) so drawing never has to await mid-frame.
  const tilesetCache = new Map();
  const neededTilesets = new Set();
  for (const r of Object.values(regions)) {
    if (r.ground) neededTilesets.add(r.ground.tileset);
    for (const entry of Object.values(r.legend || {})) neededTilesets.add(entry.tileset);
  }
  await Promise.all(
    [...neededTilesets].filter(Boolean).map(async (name) => {
      tilesetCache.set(name, await loadTileset(name));
    })
  );

  const charSheet = await loadCharacterSheet(DEFAULT_CHARACTER_SHEET);

  const state = {
    region: initialRegion,
    tileX: initialX,
    tileY: initialY,
    pixelX: initialX * TILE_SIZE,
    pixelY: initialY * TILE_SIZE,
    direction: "down",
    walkFrame: 0,
    moving: false,
  };

  function currentRegion() {
    return regions[state.region];
  }

  function legendEntryAt(regionSlug, x, y) {
    const r = regions[regionSlug];
    if (!r || x < 0 || y < 0 || x >= r.width || y >= r.height) return null;
    const ch = r.rows[y]?.[x];
    if (!ch || ch === " ") return null;
    return r.legend[ch] || null;
  }

  function persistPosition() {
    api.move(state.region, state.tileX, state.tileY).catch(() => {});
  }

  async function tryInteract() {
    const entry = legendEntryAt(state.region, state.tileX, state.tileY);
    if (!entry || !entry.resource) return;
    try {
      const result = await api.interact(state.region, state.tileX, state.tileY);
      for (const ev of result.events || []) {
        if (ev.type === "encounter") onEvent(`A wild Pokemon appeared!`);
        if (ev.type === "item") onEvent(`Found an item!`);
      }
    } catch {
      // cooldown or race - ignore, not worth surfacing
    }
  }

  function beginMove(direction) {
    if (state.moving) return;
    state.direction = FACING[direction];
    const [dx, dy] = DELTA[direction];
    const targetX = state.tileX + dx;
    const targetY = state.tileY + dy;
    const region = currentRegion();

    const outOfBounds = targetX < 0 || targetY < 0 || targetX >= region.width || targetY >= region.height;
    if (outOfBounds) {
      const exitTo = region.exits[direction];
      if (!exitTo) return;
      enterRegion(exitTo, direction);
      return;
    }

    const entry = legendEntryAt(state.region, targetX, targetY);
    if (entry && entry.blocking) return;

    animateStep(targetX, targetY);
  }

  function enterRegion(toRegionSlug, exitDirection) {
    const enterFrom = OPPOSITE[exitDirection];
    const destRegion = regions[toRegionSlug];
    const midX = Math.floor(destRegion.width / 2);
    const midY = Math.floor(destRegion.height / 2);
    let tileX = midX, tileY = midY;
    if (enterFrom === "north") tileY = 1;
    else if (enterFrom === "south") tileY = destRegion.height - 2;
    else if (enterFrom === "west") tileX = 1;
    else if (enterFrom === "east") tileX = destRegion.width - 2;

    state.region = toRegionSlug;
    state.tileX = tileX;
    state.tileY = tileY;
    state.pixelX = tileX * TILE_SIZE;
    state.pixelY = tileY * TILE_SIZE;
    persistPosition();
    onEvent(`Entered ${destRegion.name}.`);
  }

  function animateStep(targetX, targetY) {
    state.moving = true;
    const startX = state.pixelX, startY = state.pixelY;
    const endX = targetX * TILE_SIZE, endY = targetY * TILE_SIZE;
    const start = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - start) / STEP_MS);
      state.pixelX = startX + (endX - startX) * t;
      state.pixelY = startY + (endY - startY) * t;
      state.walkFrame = Math.floor(now / 130) % 4;
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        state.tileX = targetX;
        state.tileY = targetY;
        state.pixelX = endX;
        state.pixelY = endY;
        state.moving = false;
        persistPosition();
        tryInteract();
      }
    }
    requestAnimationFrame(frame);
  }

  const heldDirs = [];
  const KEY_DIRS = {
    ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east",
    w: "north", s: "south", a: "west", d: "east",
  };
  function onKeyDown(e) {
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    if (!heldDirs.includes(dir)) {
      heldDirs.push(dir);
      beginMove(dir);
    }
  }
  function onKeyUp(e) {
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    const i = heldDirs.indexOf(dir);
    if (i !== -1) heldDirs.splice(i, 1);
  }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => { heldDirs.length = 0; });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const cam = cameraOffset();
    const clickX = Math.floor((e.clientX - rect.left + cam.x) / TILE_SIZE);
    const clickY = Math.floor((e.clientY - rect.top + cam.y) / TILE_SIZE);
    const dx = clickX - state.tileX, dy = clickY - state.tileY;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    if (dx === 1) beginMove("east");
    else if (dx === -1) beginMove("west");
    else if (dy === 1) beginMove("south");
    else if (dy === -1) beginMove("north");
  });

  function cameraOffset() {
    const region = currentRegion();
    const viewW = canvas.width, viewH = canvas.height;
    const regionW = region.width * TILE_SIZE, regionH = region.height * TILE_SIZE;
    const centerX = state.pixelX + TILE_SIZE / 2 - viewW / 2;
    const centerY = state.pixelY + TILE_SIZE / 2 - viewH / 2;
    const x = regionW <= viewW ? -(viewW - regionW) / 2 : clamp(centerX, 0, regionW - viewW);
    const y = regionH <= viewH ? -(viewH - regionH) / 2 : clamp(centerY, 0, regionH - viewH);
    return { x, y };
  }

  function draw() {
    if (!state.moving && heldDirs.length) beginMove(heldDirs[heldDirs.length - 1]);

    const region = currentRegion();
    const cam = cameraOffset();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const startX = Math.max(0, Math.floor(cam.x / TILE_SIZE));
    const startY = Math.max(0, Math.floor(cam.y / TILE_SIZE));
    const endX = Math.min(region.width, Math.ceil((cam.x + canvas.width) / TILE_SIZE));
    const endY = Math.min(region.height, Math.ceil((cam.y + canvas.height) / TILE_SIZE));

    const groundImg = region.ground ? tilesetCache.get(region.ground.tileset) : null;
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const px = x * TILE_SIZE - cam.x, py = y * TILE_SIZE - cam.y;
        if (groundImg) drawTileCell(ctx, groundImg, region.ground.tx, region.ground.ty, px, py, TILE_SIZE);
        const entry = legendEntryAt(state.region, x, y);
        if (!entry) continue;
        const img = tilesetCache.get(entry.tileset);
        if (!img) continue;
        if (entry.autotile) {
          const mask = computeAutotileMask((dx, dy) =>
            autotileIsOpenNeighbor(legendEntryAt(state.region, x + dx, y + dy), entry)
          );
          const [ax, ay] = autotilePosition(mask);
          drawTileCell(ctx, img, ax, ay, px, py, TILE_SIZE);
        } else {
          drawTileCell(ctx, img, entry.tx, entry.ty, px, py, TILE_SIZE);
        }
      }
    }

    if (charSheet) {
      const feetX = state.pixelX + TILE_SIZE / 2 - cam.x;
      const feetY = state.pixelY + TILE_SIZE - cam.y;
      const frame = state.moving ? state.walkFrame : 0;
      drawCharacterFrame(ctx, charSheet, state.direction, frame, feetX - CHAR_SIZE / 2, feetY - CHAR_SIZE, CHAR_SIZE);
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  return {
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    },
  };
}
