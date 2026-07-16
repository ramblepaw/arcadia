// Bounded reachability search used to detect true FreeCell deadlocks,
// mirroring games/klondike/js/solver.js. Parking a card in a free cell is
// almost always "legal" even when it accomplishes nothing - so "is some
// move legal" is the wrong question here too. This asks whether ANY
// sequence of legal moves could ever place another card on a foundation.

import { getRunFromIndex, canPlaceOnTableau, canPlaceOnFoundation, maxSupermove } from "./rules.js";

const NODE_BUDGET = 20000;
const TIME_BUDGET_MS = 300;

function stateKey(tableau, freeCells, foundations) {
  const t = tableau.map((col) => col.map((c) => `${c.rank}${c.suit[0]}`).join(",")).join("|");
  const c = freeCells.map((card) => (card ? `${card.rank}${card.suit[0]}` : "_")).join(",");
  const f = Object.keys(foundations)
    .sort()
    .map((suit) => `${suit}:${foundations[suit]}`)
    .join(",");
  return `${t}#${c}#${f}`;
}

function cloneState(tableau, freeCells, foundations) {
  return structuredClone({ tableau, freeCells, foundations });
}

function hasFoundationPlay(tableau, freeCells, foundations) {
  for (const column of tableau) {
    if (column.length === 0) continue;
    const top = column[column.length - 1];
    if (canPlaceOnFoundation(foundations, top)) return true;
  }
  for (const card of freeCells) {
    if (card && canPlaceOnFoundation(foundations, card)) return true;
  }
  return false;
}

function successors(state) {
  const { tableau: t, freeCells: fc, foundations: f } = state;
  const freeAvail = fc.filter((c) => c === null).length;
  const emptyCols = t.filter((col) => col.length === 0).length;
  const next = [];

  // Tableau -> tableau.
  for (let from = 0; from < t.length; from++) {
    const column = t[from];
    for (let i = 0; i < column.length; i++) {
      const run = getRunFromIndex(column, i);
      if (!run) continue;
      for (let to = 0; to < t.length; to++) {
        if (to === from) continue;
        const destColumn = t[to];
        if (!canPlaceOnTableau(destColumn, run)) continue;
        const capacity = maxSupermove(freeAvail, emptyCols, destColumn.length === 0);
        if (run.length > capacity) continue;
        const clone = cloneState(t, fc, f);
        const moving = clone.tableau[from].splice(i);
        clone.tableau[to].push(...moving);
        next.push(clone);
      }
    }
  }

  // Tableau -> free cell.
  if (freeAvail > 0) {
    for (let from = 0; from < t.length; from++) {
      const column = t[from];
      if (column.length === 0) continue;
      const cellIndex = fc.indexOf(null);
      const clone = cloneState(t, fc, f);
      const card = clone.tableau[from].pop();
      clone.freeCells[cellIndex] = card;
      next.push(clone);
    }
  }

  // Free cell -> tableau.
  for (let cell = 0; cell < fc.length; cell++) {
    const card = fc[cell];
    if (!card) continue;
    for (let to = 0; to < t.length; to++) {
      if (!canPlaceOnTableau(t[to], [card])) continue;
      const clone = cloneState(t, fc, f);
      clone.freeCells[cell] = null;
      clone.tableau[to].push(card);
      next.push(clone);
    }
  }

  return next;
}

/**
 * Can any sequence of legal moves from this position ever place another
 * card on a foundation? `foundations` is `{ suit: topRank }`.
 */
export function canMakeProgress(tableau, freeCells, foundations) {
  if (hasFoundationPlay(tableau, freeCells, foundations)) return true;

  const visited = new Set([stateKey(tableau, freeCells, foundations)]);
  const stack = [{ tableau, freeCells, foundations }];
  const deadline = Date.now() + TIME_BUDGET_MS;
  let explored = 0;

  while (stack.length > 0) {
    if (++explored > NODE_BUDGET || Date.now() > deadline) return true; // budget exhausted - assume not stuck
    const state = stack.pop();

    for (const next of successors(state)) {
      if (hasFoundationPlay(next.tableau, next.freeCells, next.foundations)) return true;
      const key = stateKey(next.tableau, next.freeCells, next.foundations);
      if (!visited.has(key)) {
        visited.add(key);
        stack.push(next);
      }
    }
  }

  return false; // exhausted every reachable state without ever reaching a foundation
}
