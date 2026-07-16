// Bounded reachability search used to detect true Spider deadlocks, mirroring
// games/klondike/js/solver.js. A legal tableau shuffle is often available
// even when no sequence of moves can ever complete another King-to-Ace run
// (e.g. every card that could extend a run is buried under mismatched
// cards with no empty column to unblock them) - so "is some move legal" is
// the wrong question. This asks whether ANY sequence of shuffles/deals could
// ever complete one more sequence.

import { getMovableRun, canDropOn, hasEmptyColumn, checkAndClearSequence } from "./rules.js";

const NODE_BUDGET = 20000;
const TIME_BUDGET_MS = 300;

function stateKey(tableau, stock) {
  const t = tableau
    .map((col) => col.map((cell) => `${cell.card.rank}${cell.card.suit[0]}${cell.faceUp ? 1 : 0}`).join(","))
    .join("|");
  return `${t}#${stock.length}`;
}

function cloneState(tableau, stock) {
  return structuredClone({ tableau, stock });
}

/** True if clearing a completed sequence happened anywhere (mutates `tableau`). */
function clearsAnySequence(tableau) {
  let cleared = false;
  for (const column of tableau) {
    if (checkAndClearSequence(column)) cleared = true;
  }
  return cleared;
}

function successors(state) {
  const { tableau: t, stock: s } = state;
  const next = [];

  for (let from = 0; from < t.length; from++) {
    const column = t[from];
    for (let i = 0; i < column.length; i++) {
      const run = getMovableRun(column, i);
      if (!run) continue;
      for (let to = 0; to < t.length; to++) {
        if (to === from) continue;
        if (!canDropOn(t[to], column, i)) continue;
        const clone = cloneState(t, s);
        const moving = clone.tableau[from].splice(i);
        clone.tableau[to].push(...moving);
        if (clone.tableau[from].length > 0) {
          clone.tableau[from][clone.tableau[from].length - 1].faceUp = true;
        }
        next.push(clone);
      }
    }
  }

  if (s.length > 0 && !hasEmptyColumn(t)) {
    const clone = cloneState(t, s);
    for (let c = 0; c < clone.tableau.length; c++) {
      const card = clone.stock.pop();
      clone.tableau[c].push({ card, faceUp: true });
    }
    next.push(clone);
  }

  return next;
}

/**
 * Can any sequence of legal moves from this position ever complete another
 * King-to-Ace same-suit sequence?
 */
export function canMakeProgress(tableau, stock) {
  const visited = new Set([stateKey(tableau, stock)]);
  const stack = [{ tableau, stock }];
  const deadline = Date.now() + TIME_BUDGET_MS;
  let explored = 0;

  while (stack.length > 0) {
    if (++explored > NODE_BUDGET || Date.now() > deadline) return true; // budget exhausted - assume not stuck
    const state = stack.pop();

    for (const next of successors(state)) {
      if (clearsAnySequence(next.tableau)) return true;
      const key = stateKey(next.tableau, next.stock);
      if (!visited.has(key)) {
        visited.add(key);
        stack.push(next);
      }
    }
  }

  return false; // exhausted every reachable state without ever completing a sequence
}
