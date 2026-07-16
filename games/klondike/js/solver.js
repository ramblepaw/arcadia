// Bounded reachability search used to detect true Klondike deadlocks.
//
// A shallow "is some legal move available" check is not good enough: a
// pointless tableau shuffle or another draw from the stock is very often
// legal even when the game can never be won from here (e.g. every Ace is
// buried under a sequence that can never be relocated). What actually
// matters is whether ANY sequence of legal moves - shuffles, draws,
// redeals - could ever place one more card on a foundation. If not, no
// amount of further play changes anything and the game is truly stuck.
//
// This explores the reachable state space via DFS with a visited-state set
// (so shuffling a card back and forth, or cycling the stock past a point
// it's already been, is never re-explored) and a node/time budget so a
// pathological position can't hang the UI. If the budget runs out before
// either an answer is found, we assume progress may still be possible -
// a false "not stuck" is far less annoying than wrongly ending a winnable
// game.

import { canPlaceOnColumn, canPlaceOnFoundation, getMovableSequence } from "./rules.js";

const NODE_BUDGET = 20000;
const TIME_BUDGET_MS = 300;

function stateKey(tableau, stock, waste, foundations) {
  const t = tableau.map((col) => col.map((c) => `${c.rank}${c.suit[0]}${c.faceUp ? 1 : 0}`).join(",")).join("|");
  const s = stock.map((c) => `${c.rank}${c.suit[0]}`).join(",");
  const w = waste.map((c) => `${c.rank}${c.suit[0]}`).join(",");
  const f = Object.keys(foundations)
    .sort()
    .map((suit) => `${suit}:${foundations[suit].length}`)
    .join(",");
  return `${t}#${s}#${w}#${f}`;
}

function cloneState(tableau, stock, waste, foundations) {
  return structuredClone({ tableau, stock, waste, foundations });
}

function hasFoundationPlay(tableau, waste, foundations) {
  for (const col of tableau) {
    if (col.length === 0) continue;
    const top = col[col.length - 1];
    if (top.faceUp && canPlaceOnFoundation(foundations[top.suit], top)) return true;
  }
  if (waste.length > 0) {
    const top = waste[waste.length - 1];
    if (canPlaceOnFoundation(foundations[top.suit], top)) return true;
  }
  return false;
}

/** Every state reachable from `state` in exactly one legal move. */
function successors(state, drawCount) {
  const { tableau: t, stock: s, waste: w, foundations: f } = state;
  const next = [];

  // Tableau -> tableau shuffles.
  for (let from = 0; from < t.length; from++) {
    const col = t[from];
    for (let i = 0; i < col.length; i++) {
      if (!col[i].faceUp) continue;
      const seq = getMovableSequence(col, i);
      if (!seq) continue;
      for (let to = 0; to < t.length; to++) {
        if (to === from) continue;
        if (!canPlaceOnColumn(t[to], seq[0])) continue;
        const clone = cloneState(t, s, w, f);
        const moving = clone.tableau[from].splice(i);
        clone.tableau[to].push(...moving);
        if (clone.tableau[from].length > 0) {
          clone.tableau[from][clone.tableau[from].length - 1].faceUp = true;
        }
        next.push(clone);
      }
    }
  }

  // Waste -> tableau.
  if (w.length > 0) {
    const top = w[w.length - 1];
    for (let to = 0; to < t.length; to++) {
      if (!canPlaceOnColumn(t[to], top)) continue;
      const clone = cloneState(t, s, w, f);
      const card = clone.waste.pop();
      clone.tableau[to].push(card);
      next.push(clone);
    }
  }

  // Draw / redeal - deterministic, always exactly one successor.
  if (s.length > 0 || w.length > 0) {
    const clone = cloneState(t, s, w, f);
    if (clone.stock.length > 0) {
      const n = Math.min(drawCount, clone.stock.length);
      for (let i = 0; i < n; i++) {
        const card = clone.stock.pop();
        card.faceUp = true;
        clone.waste.push(card);
      }
    } else {
      while (clone.waste.length) {
        const card = clone.waste.pop();
        card.faceUp = false;
        clone.stock.push(card);
      }
    }
    next.push(clone);
  }

  return next;
}

/**
 * Can any sequence of legal moves from this position ever place another
 * card on a foundation? `drawCount` is 1 or 3, matching the live game's
 * draw mode.
 */
export function canMakeProgress(tableau, stock, waste, foundations, drawCount) {
  if (hasFoundationPlay(tableau, waste, foundations)) return true;

  const start = { tableau, stock, waste, foundations };
  const visited = new Set([stateKey(tableau, stock, waste, foundations)]);
  const stack = [start];
  const deadline = Date.now() + TIME_BUDGET_MS;
  let explored = 0;

  while (stack.length > 0) {
    if (++explored > NODE_BUDGET || Date.now() > deadline) return true; // budget exhausted - assume not stuck
    const state = stack.pop();

    for (const next of successors(state, drawCount)) {
      if (hasFoundationPlay(next.tableau, next.waste, next.foundations)) return true;
      const key = stateKey(next.tableau, next.stock, next.waste, next.foundations);
      if (!visited.has(key)) {
        visited.add(key);
        stack.push(next);
      }
    }
  }

  return false; // exhausted every reachable state without ever reaching a foundation
}
