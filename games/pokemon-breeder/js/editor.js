import { getMe } from "/api-client.js";
import * as api from "./api.js";
import { TILE_PX, loadTileset, drawTileCell, AUTOTILE_FOLDER, computeAutotileMask, autotilePosition, autotileIsOpenNeighbor } from "./tileset.js";

const CELL_PX = 24;
const CHAR_POOL = [];
for (let i = 33; i < 127; i++) {
  const c = String.fromCharCode(i);
  if (c !== '"' && c !== "\\") CHAR_POOL.push(c);
}

let regions = {};
let tilesets = [];
let currentSlug = null;
let region = null; // working copy: {name,biome,width,height,ground,exits,legend,rows}
let tilesetImage = null;
let selectedTile = null; // {tileset,tx,ty,w,h} or {tileset,autotile:true}
let currentTool = "tile";
let painting = false;
let paletteDragStart = null;

const els = {};
function $(id) { return document.getElementById(id); }

function canonicalKey(entry) {
  if (entry.autotile) return `AUTO|${entry.tileset}|${entry.blocking ? 1 : 0}|${entry.resource ? 1 : 0}`;
  return `${entry.tileset}|${entry.tx}|${entry.ty}|${entry.blocking ? 1 : 0}|${entry.resource ? 1 : 0}`;
}

function findOrCreateChar(entry) {
  const key = canonicalKey(entry);
  for (const [ch, e] of Object.entries(region.legend)) {
    if (canonicalKey(e) === key) return ch;
  }
  const used = new Set(Object.keys(region.legend));
  const ch = CHAR_POOL.find((c) => !used.has(c));
  if (!ch) throw new Error("Out of legend characters - too many distinct tile variants in this region.");
  region.legend[ch] = entry;
  return ch;
}

function cellChar(x, y) {
  return region.rows[y]?.[x] || " ";
}

function entryAt(x, y) {
  const ch = cellChar(x, y);
  if (ch === " ") return null;
  return region.legend[ch] || null;
}

function setCell(x, y, ch) {
  const row = region.rows[y].split("");
  row[x] = ch;
  region.rows[y] = row.join("");
}

function ensureRowsSize() {
  const rows = [];
  for (let y = 0; y < region.height; y++) {
    const old = region.rows[y] || "";
    rows.push((old + " ".repeat(region.width)).slice(0, region.width));
  }
  region.rows = rows;
}

// --- tileset / palette -----------------------------------------------

async function populateTilesetSelect() {
  els.tilesetSelect.innerHTML = tilesets.map((t) => `<option value="${escapeAttr(t.name)}">${escapeAttr(t.name)}</option>`).join("");
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

async function loadTilesetIntoPalette(name) {
  tilesetImage = await loadTileset(name);
  // Fixes the "only one tileset works" bug: this is the same cache
  // renderCanvas/renderMainMap read from - previously only `tilesetImage`
  // (the palette's own variable) was set here, so a tileset painted for the
  // first time in a session wouldn't actually render on the map until the
  // whole region was reloaded.
  tilesetImageCache.set(name, tilesetImage);
  els.paletteGrid.innerHTML = "";

  if (name.startsWith(AUTOTILE_FOLDER)) {
    renderAutotileSwatch(name);
    return;
  }

  const meta = tilesets.find((t) => t.name === name);
  renderRegularPalette(name, meta);
}

function renderAutotileSwatch(name) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:6px;";
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  drawTileCell(ctx, tilesetImage, 1, 1, 0, 0, 64); // interior tile as a representative preview
  c.style.cursor = "pointer";
  c.addEventListener("click", () => {
    selectedTile = { tileset: name, autotile: true };
    c.classList.add("selected");
  });
  const label = document.createElement("div");
  label.textContent = "Autotile brush - click to select";
  label.style.cssText = "font-size:11px;color:var(--text-dim);text-align:center;";
  wrap.appendChild(c);
  wrap.appendChild(label);
  els.paletteGrid.appendChild(wrap);
}

function renderRegularPalette(name, meta) {
  paletteDragStart = null;
  const cellEls = [];
  function updateSelectionHighlight(start, end) {
    const x0 = Math.min(start.tx, end.tx), x1 = Math.max(start.tx, end.tx);
    const y0 = Math.min(start.ty, end.ty), y1 = Math.max(start.ty, end.ty);
    for (const el of cellEls) {
      const tx = Number(el.dataset.tx), ty = Number(el.dataset.ty);
      el.classList.toggle("selected", tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1);
    }
    selectedTile = { tileset: name, tx: x0, ty: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  for (let ty = 0; ty < meta.rows; ty++) {
    for (let tx = 0; tx < meta.cols; tx++) {
      const c = document.createElement("canvas");
      c.width = 28; c.height = 28;
      c.dataset.tx = tx; c.dataset.ty = ty;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tilesetImage, tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX, 0, 0, 28, 28);
      c.addEventListener("mousedown", (e) => {
        e.preventDefault();
        paletteDragStart = { tx, ty };
        updateSelectionHighlight(paletteDragStart, paletteDragStart);
      });
      c.addEventListener("mouseenter", () => {
        if (paletteDragStart) updateSelectionHighlight(paletteDragStart, { tx, ty });
      });
      cellEls.push(c);
      els.paletteGrid.appendChild(c);
    }
  }
}

// --- rendering ----------------------------------------------------------

const tilesetImageCache = new Map();
async function ensureTilesetImagesLoaded() {
  const names = new Set();
  if (region.ground) names.add(region.ground.tileset);
  for (const e of Object.values(region.legend)) names.add(e.tileset);
  await Promise.all([...names].map(async (n) => {
    if (!tilesetImageCache.has(n)) tilesetImageCache.set(n, await loadTileset(n));
  }));
}

function renderCanvas() {
  const canvas = els.mapCanvas;
  canvas.width = region.width * CELL_PX;
  canvas.height = region.height * CELL_PX;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const groundImg = region.ground ? tilesetImageCache.get(region.ground.tileset) : null;
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const px = x * CELL_PX, py = y * CELL_PX;
      if (groundImg) drawTileCell(ctx, groundImg, region.ground.tx, region.ground.ty, px, py, CELL_PX);
      const entry = entryAt(x, y);
      if (entry) {
        const img = tilesetImageCache.get(entry.tileset);
        if (img) {
          if (entry.autotile) {
            const mask = computeAutotileMask((dx, dy) => autotileIsOpenNeighbor(entryAt(x + dx, y + dy), entry));
            const [ax, ay] = autotilePosition(mask);
            drawTileCell(ctx, img, ax, ay, px, py, CELL_PX);
          } else {
            drawTileCell(ctx, img, entry.tx, entry.ty, px, py, CELL_PX);
          }
        }
        if (entry.blocking) {
          ctx.fillStyle = "rgba(200,40,40,0.35)";
          ctx.fillRect(px, py, CELL_PX, CELL_PX);
        }
        if (entry.resource) {
          ctx.fillStyle = "rgba(255,220,60,0.9)";
          ctx.beginPath();
          ctx.arc(px + CELL_PX / 2, py + CELL_PX / 2, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  for (let x = 0; x <= region.width; x++) {
    ctx.beginPath(); ctx.moveTo(x * CELL_PX, 0); ctx.lineTo(x * CELL_PX, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= region.height; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * CELL_PX); ctx.lineTo(canvas.width, y * CELL_PX); ctx.stroke();
  }
}

// --- painting -----------------------------------------------------------

function applyToolAt(x, y) {
  if (x < 0 || y < 0 || x >= region.width || y >= region.height) return;
  if (currentTool === "tile") {
    if (!selectedTile) return;
    if (selectedTile.autotile) {
      const ch = findOrCreateChar({ tileset: selectedTile.tileset, autotile: true, blocking: false, resource: false });
      setCell(x, y, ch);
    } else {
      const w = selectedTile.w || 1, h = selectedTile.h || 1;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const px = x + dx, py = y + dy;
          if (px < 0 || py < 0 || px >= region.width || py >= region.height) continue;
          const ch = findOrCreateChar({
            tileset: selectedTile.tileset, tx: selectedTile.tx + dx, ty: selectedTile.ty + dy,
            blocking: false, resource: false,
          });
          setCell(px, py, ch);
        }
      }
    }
  } else if (currentTool === "erase") {
    setCell(x, y, " ");
  } else if (currentTool === "blocking") {
    const base = entryAt(x, y) || { ...region.ground, blocking: false, resource: false };
    const next = { ...base, blocking: !base.blocking };
    setCell(x, y, findOrCreateChar(next));
  } else if (currentTool === "resource") {
    const base = entryAt(x, y) || { ...region.ground, blocking: false, resource: false };
    const next = { ...base, resource: !base.resource };
    setCell(x, y, findOrCreateChar(next));
  }
  renderCanvas();
}

function canvasCellFromEvent(e) {
  const rect = els.mapCanvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / CELL_PX);
  const y = Math.floor((e.clientY - rect.top) / CELL_PX);
  return { x, y };
}

// --- region load/new/save ------------------------------------------------

function regionOptionsHtml(selectedSlug, includeNone) {
  let html = includeNone ? '<option value="">(none)</option>' : "";
  html += Object.keys(regions).map((slug) => `<option value="${slug}" ${slug === selectedSlug ? "selected" : ""}>${slug}</option>`).join("");
  return html;
}

function refreshRegionSelects() {
  els.regionSelect.innerHTML = regionOptionsHtml(currentSlug, false);
  for (const dir of ["north", "south", "east", "west"]) {
    const sel = els[`exit${dir[0].toUpperCase()}${dir.slice(1)}`];
    const current = region.exits[dir] || "";
    sel.innerHTML = regionOptionsHtml(current, true);
  }
}

async function loadRegion(slug) {
  currentSlug = slug;
  region = JSON.parse(JSON.stringify(regions[slug]));
  region.exits = region.exits || {};
  els.name.value = region.name || "";
  els.biome.value = region.biome || "";
  els.width.value = region.width;
  els.height.value = region.height;
  await ensureTilesetImagesLoaded();
  refreshRegionSelects();
  updateGroundPreview();
  renderCanvas();
}

function newRegion() {
  const slug = els.newSlug.value.trim();
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    setStatus("Slug must be lowercase letters/numbers/hyphens.", true);
    return;
  }
  if (regions[slug]) {
    setStatus("That slug already exists.", true);
    return;
  }
  regions[slug] = {
    name: slug, biome: "", width: 20, height: 15,
    ground: (selectedTile && !selectedTile.autotile)
      ? { tileset: selectedTile.tileset, tx: selectedTile.tx, ty: selectedTile.ty }
      : { tileset: tilesets[0]?.name, tx: 0, ty: 0 },
    exits: {}, legend: {}, rows: Array.from({ length: 15 }, () => " ".repeat(20)),
  };
  loadRegion(slug);
}

function updateGroundPreview() {
  const c = els.groundPreview;
  if (!region.ground) return;
  const img = tilesetImageCache.get(region.ground.tileset);
  if (!img) return;
  const canvas = document.createElement("canvas");
  canvas.width = 24; canvas.height = 24;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  drawTileCell(ctx, img, region.ground.tx, region.ground.ty, 0, 0, 24);
  c.innerHTML = "";
  c.appendChild(canvas);
}

function setStatus(msg, isError) {
  els.saveStatus.textContent = msg;
  els.saveStatus.style.color = isError ? "var(--danger)" : "var(--ok)";
  setTimeout(() => { els.saveStatus.textContent = ""; }, 4000);
}

async function saveCurrentRegion() {
  region.name = els.name.value.trim() || currentSlug;
  region.biome = els.biome.value.trim();
  region.exits = {
    north: els.exitNorth.value || undefined,
    south: els.exitSouth.value || undefined,
    east: els.exitEast.value || undefined,
    west: els.exitWest.value || undefined,
  };
  for (const k of Object.keys(region.exits)) if (!region.exits[k]) delete region.exits[k];
  try {
    await api.saveRegion(currentSlug, region);
    regions[currentSlug] = JSON.parse(JSON.stringify(region));
    setStatus("Saved.");
  } catch (err) {
    setStatus(err.message, true);
  }
}

function resizeRegion() {
  region.width = Math.max(5, Number(els.width.value) || region.width);
  region.height = Math.max(5, Number(els.height.value) || region.height);
  ensureRowsSize();
  renderCanvas();
}

// --- boot -----------------------------------------------------------------

async function boot() {
  const me = await getMe().catch(() => null);
  if (!me || me.role !== "admin") {
    document.getElementById("not-admin-screen").classList.remove("hidden");
    return;
  }

  els.regionSelect = $("region-select");
  els.newSlug = $("new-region-slug");
  els.name = $("region-name");
  els.biome = $("region-biome");
  els.width = $("region-width");
  els.height = $("region-height");
  els.tilesetSelect = $("tileset-select");
  els.paletteGrid = $("palette-grid");
  els.mapCanvas = $("map-canvas");
  els.saveStatus = $("save-status");
  els.groundPreview = $("ground-preview");
  els.hoverInfo = $("hover-info");
  els.exitNorth = $("exit-north");
  els.exitSouth = $("exit-south");
  els.exitEast = $("exit-east");
  els.exitWest = $("exit-west");

  [tilesets, regions] = await Promise.all([api.getTilesets(), api.getAllRegions()]);
  await populateTilesetSelect();
  if (tilesets.length) {
    els.tilesetSelect.value = tilesets[0].name;
    await loadTilesetIntoPalette(tilesets[0].name);
  }
  els.tilesetSelect.addEventListener("change", () => loadTilesetIntoPalette(els.tilesetSelect.value));

  const firstSlug = Object.keys(regions)[0];
  if (firstSlug) await loadRegion(firstSlug);

  els.regionSelect.addEventListener("change", () => loadRegion(els.regionSelect.value));
  $("new-region-btn").addEventListener("click", newRegion);
  $("resize-btn").addEventListener("click", resizeRegion);
  $("save-btn").addEventListener("click", saveCurrentRegion);
  $("set-ground-btn").addEventListener("click", async () => {
    if (!selectedTile || selectedTile.autotile) {
      setStatus("Ground must be a single plain tile, not an autotile brush.", true);
      return;
    }
    region.ground = { tileset: selectedTile.tileset, tx: selectedTile.tx, ty: selectedTile.ty };
    await ensureTilesetImagesLoaded();
    updateGroundPreview();
    renderCanvas();
  });

  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTool = btn.dataset.tool;
      document.querySelectorAll(".tool-btn").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  els.mapCanvas.addEventListener("mousedown", (e) => {
    painting = true;
    const { x, y } = canvasCellFromEvent(e);
    applyToolAt(x, y);
  });
  window.addEventListener("mouseup", () => { painting = false; paletteDragStart = null; });
  els.mapCanvas.addEventListener("mousemove", (e) => {
    const { x, y } = canvasCellFromEvent(e);
    const entry = entryAt(x, y);
    const tileLabel = entry ? (entry.autotile ? `${entry.tileset} (autotile)` : `${entry.tileset}\n${entry.tx},${entry.ty}`) : "ground (default)";
    els.hoverInfo.textContent = `(${x}, ${y})\n${tileLabel}${entry ? `\nblocking:${!!entry.blocking} resource:${!!entry.resource}` : ""}`;
    if (painting) applyToolAt(x, y);
  });

  document.getElementById("editor").classList.remove("hidden");
}

boot();
