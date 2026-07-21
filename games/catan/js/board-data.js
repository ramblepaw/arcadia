// Board geometry for Catan. Hexes use axial coordinates (pointy-top
// orientation, matching the real board's horizontal rows of 3-4-5-4-3).
// Nodes (settlement/city spots) and edges (road spots) are derived by
// rendering each hex's 6 corners to pixel space and de-duplicating corners
// that coincide across neighboring hexes - two hexes sharing an edge always
// produce two identical corner pixels, so rounding + a coordinate key is
// enough to merge them into a single shared node/edge without hand-authoring
// a graph.

export const HEX_SIZE = 100;
const BOARD_RADIUS = 2; // 19 tiles: rows of 3,4,5,4,3

export const RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"];

const RESOURCE_COUNTS = { wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3, desert: 1 };
const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

// Pip count (relative probability weight) for each dice number - used by the
// bot's spot-value heuristic, and for rendering token dot counts.
export const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export const PORT_TYPES = ["3:1", "3:1", "3:1", "3:1", "wood", "brick", "sheep", "wheat", "ore"];

export const BUILD_COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { sheep: 1, wheat: 1, ore: 1 },
};

export const PIECE_SUPPLY = { road: 15, settlement: 5, city: 4 };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function axialToPixel(q, r) {
  return {
    x: HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: HEX_SIZE * 1.5 * r,
  };
}

function hexCorners(center) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({
      x: center.x + HEX_SIZE * Math.cos(angle),
      y: center.y + HEX_SIZE * Math.sin(angle),
    });
  }
  return corners;
}

function nodeKey(pt) {
  return `${Math.round(pt.x * 10)}:${Math.round(pt.y * 10)}`;
}

function hexCoordList() {
  const coords = [];
  for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q++) {
    const r1 = Math.max(-BOARD_RADIUS, -q - BOARD_RADIUS);
    const r2 = Math.min(BOARD_RADIUS, -q + BOARD_RADIUS);
    for (let r = r1; r <= r2; r++) coords.push({ q, r });
  }
  return coords;
}

/** Builds the fixed graph (hex/node/edge geometry + adjacency) that every
 *  game shares regardless of the random resource/number/port assignment. */
function buildGeometry() {
  const hexes = [];
  const nodes = [];
  const edges = [];
  const nodesByKey = new Map();
  const edgesByKey = new Map();

  hexCoordList().forEach((coord, hexId) => {
    const center = axialToPixel(coord.q, coord.r);
    const corners = hexCorners(center);
    const cornerNodeIds = corners.map((pt) => {
      const key = nodeKey(pt);
      let node = nodesByKey.get(key);
      if (!node) {
        node = {
          id: nodes.length, x: pt.x, y: pt.y,
          hexIds: [], edgeIds: [], neighborIds: [],
          building: null, port: null,
        };
        nodesByKey.set(key, node);
        nodes.push(node);
      }
      return node.id;
    });

    cornerNodeIds.forEach((nid) => nodes[nid].hexIds.push(hexId));

    for (let i = 0; i < 6; i++) {
      const a = cornerNodeIds[i];
      const b = cornerNodeIds[(i + 1) % 6];
      const ekey = a < b ? `${a}_${b}` : `${b}_${a}`;
      let edge = edgesByKey.get(ekey);
      if (!edge) {
        edge = { id: edges.length, nodeIds: [a, b], hexIds: [], road: null };
        edgesByKey.set(ekey, edge);
        edges.push(edge);
      }
      edge.hexIds.push(hexId);
    }

    hexes.push({
      id: hexId, q: coord.q, r: coord.r, x: center.x, y: center.y,
      cornerNodeIds, resource: null, number: null,
    });
  });

  edges.forEach((edge) => {
    const [a, b] = edge.nodeIds;
    nodes[a].edgeIds.push(edge.id);
    nodes[a].neighborIds.push(b);
    nodes[b].edgeIds.push(edge.id);
    nodes[b].neighborIds.push(a);
  });

  const hexAdjacency = hexes.map(() => new Set());
  edges.forEach((edge) => {
    if (edge.hexIds.length === 2) {
      const [ha, hb] = edge.hexIds;
      hexAdjacency[ha].add(hb);
      hexAdjacency[hb].add(ha);
    }
  });

  return { hexes, nodes, edges, hexAdjacency };
}

/** Orders the boundary (single-hex) edges into one clockwise cycle by
 *  walking shared vertices, so ports can be spaced evenly around the coast. */
function boundaryCycle(nodes, edges) {
  const boundaryEdges = edges.filter((e) => e.hexIds.length === 1);
  const edgesByNode = new Map();
  boundaryEdges.forEach((e) => {
    e.nodeIds.forEach((n) => {
      if (!edgesByNode.has(n)) edgesByNode.set(n, []);
      edgesByNode.get(n).push(e);
    });
  });

  const visited = new Set();
  const start = boundaryEdges[0];
  const cycle = [start];
  visited.add(start.id);
  let currentNode = start.nodeIds[1];
  let prevEdge = start;

  while (true) {
    const candidates = edgesByNode.get(currentNode).filter((e) => e.id !== prevEdge.id);
    const next = candidates.find((e) => !visited.has(e.id));
    if (!next) break;
    cycle.push(next);
    visited.add(next.id);
    currentNode = next.nodeIds[0] === currentNode ? next.nodeIds[1] : next.nodeIds[0];
    prevEdge = next;
  }
  return cycle;
}

function assignPorts(nodes, edges) {
  const cycle = boundaryCycle(nodes, edges);
  const types = shuffle(PORT_TYPES);
  const step = cycle.length / types.length;
  const ports = [];
  for (let i = 0; i < types.length; i++) {
    const idx = Math.round(i * step) % cycle.length;
    const edge = cycle[idx];
    edge.nodeIds.forEach((nid) => { nodes[nid].port = types[i]; });
    ports.push({ type: types[i], nodeIds: [...edge.nodeIds] });
  }
  return ports;
}

function assignResourcesAndNumbers(hexes, hexAdjacency) {
  const pool = [];
  for (const [resource, count] of Object.entries(RESOURCE_COUNTS)) {
    for (let i = 0; i < count; i++) pool.push(resource);
  }

  let attempt = 0;
  let resourceOrder;
  let numberOrder;
  while (true) {
    attempt++;
    resourceOrder = shuffle(pool);
    const nonDesertIdx = resourceOrder.map((r, i) => (r !== "desert" ? i : -1)).filter((i) => i >= 0);
    const shuffledNumbers = shuffle(NUMBER_TOKENS);
    numberOrder = new Array(resourceOrder.length).fill(null);
    nonDesertIdx.forEach((hexIdx, i) => { numberOrder[hexIdx] = shuffledNumbers[i]; });

    if (attempt > 200) break; // give up avoiding 6/8 adjacency, just ship it
    let ok = true;
    for (let i = 0; i < hexes.length && ok; i++) {
      if (numberOrder[i] !== 6 && numberOrder[i] !== 8) continue;
      for (const nb of hexAdjacency[i]) {
        if (numberOrder[nb] === 6 || numberOrder[nb] === 8) { ok = false; break; }
      }
    }
    if (ok) break;
  }

  let robberHexId = null;
  hexes.forEach((hex, i) => {
    hex.resource = resourceOrder[i];
    hex.number = numberOrder[i];
    if (hex.resource === "desert") robberHexId = hex.id;
  });
  return robberHexId;
}

export function generateBoard() {
  const { hexes, nodes, edges, hexAdjacency } = buildGeometry();
  const robberHexId = assignResourcesAndNumbers(hexes, hexAdjacency);
  const ports = assignPorts(nodes, edges);
  return { hexes, nodes, edges, ports, robberHexId };
}
