// Hand evaluation: given a hand and the round's wild rank, find the arrangement
// into runs/sets that minimizes deadwood, using a bitmask DP over the non-wild
// cards (candidate melds) plus a shared pool of wild cards.

import { SUITS, MIN_RANK, MAX_RANK, isWildCard, cardValue } from "./deck.js";

function buildSetCandidates(nonWildCards, maxWilds) {
  // A book is 3+ cards of the same rank, suit doesn't matter at all - with a
  // double deck you can legally have e.g. two King of Hearts in one book.
  // Since a matched card always costs 0, it's never worse to include every
  // same-rank card in the book, so each rank needs only one base mask (no
  // per-suit subset enumeration), optionally padded with any number of wilds.
  const byRank = new Map();
  nonWildCards.forEach((card, idx) => {
    if (!byRank.has(card.rank)) byRank.set(card.rank, []);
    byRank.get(card.rank).push(idx);
  });

  const candidates = [];
  for (const [rank, idxs] of byRank) {
    const size = idxs.length;
    let mask = 0n;
    idxs.forEach((i) => { mask |= (1n << BigInt(i)); });
    for (let wildsNeeded = 0; wildsNeeded <= maxWilds; wildsNeeded++) {
      if (size + wildsNeeded < 3) continue;
      candidates.push({ mask, wildsNeeded, kind: "set", rank });
    }
  }
  return candidates;
}

function buildRunCandidates(nonWildCards, maxWilds) {
  // A double deck can give a duplicate of the same suit+rank card - each
  // copy can only ever anchor one run (never both slots of the same run),
  // but two copies could each complete a *different* run, so every copy
  // needs to be a selectable option, not just the first one seen.
  const bySuit = new Map();
  for (const s of SUITS) bySuit.set(s, new Map());
  nonWildCards.forEach((card, idx) => {
    const m = bySuit.get(card.suit);
    if (!m.has(card.rank)) m.set(card.rank, []);
    m.get(card.rank).push(idx);
  });

  const MAX_VARIANTS_PER_RANGE = 8;
  const candidates = [];
  for (const suit of SUITS) {
    const rankMap = bySuit.get(suit);
    for (let a = MIN_RANK; a <= MAX_RANK; a++) {
      for (let b = a + 2; b <= MAX_RANK; b++) {
        const choiceLists = [];
        let missing = 0;
        for (let r = a; r <= b; r++) {
          const opts = rankMap.get(r);
          if (opts && opts.length > 0) {
            choiceLists.push(opts);
          } else {
            missing++;
          }
        }
        if (choiceLists.length === 0) continue;
        if (missing > maxWilds) continue;

        let combos = [0n];
        for (const opts of choiceLists) {
          const next = [];
          outer: for (const combo of combos) {
            for (const idx of opts) {
              next.push(combo | (1n << BigInt(idx)));
              if (next.length >= MAX_VARIANTS_PER_RANGE) break outer;
            }
          }
          combos = next;
        }
        const seen = new Set();
        for (const mask of combos) {
          const key = mask.toString();
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ mask, wildsNeeded: missing, kind: "run", suit, range: [a, b] });
        }
      }
    }
  }
  return candidates;
}

/**
 * Finds the minimum-deadwood arrangement of a hand for the given wild rank.
 * Returns { deadwoodValue, deadwoodCardIds, groups, canGoOut, wildsUsedInGroups }
 * where groups is an array of { kind, cardIds } (cardIds includes real cards;
 * wild cards filling gaps are appended separately as wildCardIds).
 */
export function evaluateHand(cards, wildRank) {
  // Jokers (50pts) and the round's wild-rank card (20pts) are interchangeable
  // for melding, but not for deadwood cost - so when choosing which wilds are
  // "spent" on melds vs left over, always prefer to spend jokers first and
  // leave the cheaper rank-wild cards as any unavoidable leftover.
  const wildCards = cards
    .filter((c) => isWildCard(c, wildRank))
    .sort((a, b) => (a.isJoker === b.isJoker ? 0 : a.isJoker ? -1 : 1));
  const rankWildCount = wildCards.filter((c) => !c.isJoker).length;
  const nonWildCards = cards.filter((c) => !isWildCard(c, wildRank));
  const W = wildCards.length;
  const n = nonWildCards.length;
  const fullMask = n === 0 ? 0n : (1n << BigInt(n)) - 1n;

  const candidates = [
    ...buildSetCandidates(nonWildCards, W),
    ...buildRunCandidates(nonWildCards, W),
  ];

  const byIdx = Array.from({ length: n }, () => []);
  candidates.forEach((cand) => {
    for (let i = 0; i < n; i++) {
      if (cand.mask & (1n << BigInt(i))) byIdx[i].push(cand);
    }
  });

  const memo = new Map();

  function lowestBitIndex(mask) {
    let i = 0;
    while (!(mask & (1n << BigInt(i)))) i++;
    return i;
  }

  // Any wilds left over once every non-wild card has been resolved either
  // form their own meld (3+, free) or sit as deadwood (1-2 cards). Folding
  // this into the base case lets plain value-minimization find the true
  // optimum - no separate reasoning about "wilds actually spent" needed,
  // since spending more wilds on a meld is only chosen when it truly lowers
  // the total (including this leftover cost), never as an arbitrary tie-break.
  // The cheapest possible leftover always uses up rank-wild cards (20pts)
  // before jokers (50pts), matching the joker-first consumption order above.
  function leftoverPenalty(remaining) {
    if (remaining >= 3) return 0;
    const cheap = Math.min(remaining, rankWildCount);
    const expensive = remaining - cheap;
    return cheap * 20 + expensive * 50;
  }

  function solve(mask, budget) {
    if (mask === 0n) return { value: leftoverPenalty(budget), choice: null };
    const key = mask.toString() + "|" + budget;
    const cached = memo.get(key);
    if (cached) return cached;

    const idx = lowestBitIndex(mask);
    const card = nonWildCards[idx];
    const bit = 1n << BigInt(idx);

    let best = {
      value: cardValue(card, wildRank) + solve(mask & ~bit, budget).value,
      choice: { type: "deadwood", idx },
    };

    for (const cand of byIdx[idx]) {
      if ((cand.mask & mask) !== cand.mask) continue;
      if (cand.wildsNeeded > budget) continue;
      const sub = solve(mask & ~cand.mask, budget - cand.wildsNeeded);
      if (sub.value < best.value) {
        best = { value: sub.value, choice: { type: "meld", cand } };
      }
    }

    memo.set(key, best);
    return best;
  }

  const rootResult = solve(fullMask, W);
  const deadwoodValue = rootResult.value;

  // Reconstruct the chosen arrangement, including how leftover wilds (if any)
  // landed at the point every non-wild card was resolved.
  const groups = [];
  const deadwoodCardIds = [];
  let wildPool = wildCards.slice();
  function takeWilds(count) {
    const taken = wildPool.slice(0, count);
    wildPool = wildPool.slice(count);
    return taken.map((c) => c.id);
  }

  function backtrace(mask, budget) {
    if (mask === 0n) {
      if (budget >= 3) {
        groups.push({ kind: "wild-set", cardIds: takeWilds(budget) });
      } else if (budget > 0) {
        takeWilds(budget).forEach((id) => deadwoodCardIds.push(id));
      }
      return;
    }
    const key = mask.toString() + "|" + budget;
    const { choice } = memo.get(key);
    if (choice.type === "deadwood") {
      deadwoodCardIds.push(nonWildCards[choice.idx].id);
      backtrace(mask & ~(1n << BigInt(choice.idx)), budget);
    } else {
      const cand = choice.cand;
      const realIds = [];
      for (let i = 0; i < n; i++) {
        if (cand.mask & (1n << BigInt(i))) realIds.push(nonWildCards[i].id);
      }
      const wildIds = takeWilds(cand.wildsNeeded);
      groups.push({ kind: cand.kind, cardIds: [...realIds, ...wildIds] });
      backtrace(mask & ~cand.mask, budget - cand.wildsNeeded);
    }
  }
  backtrace(fullMask, W);

  return {
    deadwoodValue,
    deadwoodCardIds,
    groups,
    canGoOut: deadwoodValue === 0,
  };
}

/** Point value the player would score if they DON'T go out this round. */
export function handDeadwoodValue(cards, wildRank) {
  return evaluateHand(cards, wildRank).deadwoodValue;
}
