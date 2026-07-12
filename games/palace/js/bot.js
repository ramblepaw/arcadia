import { legalRanks } from "./rules.js";

function power(card) {
  if (card.rank === 2) return 100;
  if (card.rank === 10) return 99;
  if (card.rank === 7) return 90;
  if (card.rank === 8) return 80;
  return card.rank;
}

/**
 * Pre-game swap heuristic: keep the 3 most "powerful" cards (2s, 10s, 7s,
 * 8s, then highest rank) between hand+face-up in hand, push the rest face
 * up. Returns swap pairs to apply via game.swapCards, matched by identity
 * since ranks can repeat.
 */
export function chooseSwapPairs(hand, faceUp) {
  const combined = [...hand, ...faceUp];
  const sorted = combined.slice().sort((a, b) => power(b) - power(a));
  const desiredHandIds = new Set(sorted.slice(0, 3).map((c) => c.id));

  const moveOutOfHand = hand.filter((c) => !desiredHandIds.has(c.id));
  const moveIntoHand = faceUp.filter((c) => desiredHandIds.has(c.id));

  const pairs = [];
  for (let i = 0; i < moveOutOfHand.length && i < moveIntoHand.length; i++) {
    pairs.push({ handCardId: moveOutOfHand[i].id, faceUpCardId: moveIntoHand[i].id });
  }
  return pairs;
}

function weightedChoice(items, weightFn) {
  const weights = items.map(weightFn);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Choose which same-rank group of cards to play from a hand/face-up zone,
 * or null if the bot has no legal play and must pick up the pile.
 * Weighted toward dumping the rank it holds the most copies of (and toward
 * burning with a 10 once the pile is long) rather than a strict
 * highest-wins pick - with the draw pile empty and few players left, two
 * fully deterministic bots can otherwise lock into an exact repeating
 * cycle of hands that never terminates, so the randomness here is load
 * bearing, not cosmetic.
 */
export function choosePlay(zoneCards, requirement, pileLength) {
  const legal = legalRanks(zoneCards, requirement);
  if (legal.length === 0) return null;

  const nonSpecial = legal.filter((r) => r !== 2 && r !== 10);
  let chosenRank;
  if (nonSpecial.length > 0) {
    chosenRank = weightedChoice(nonSpecial, (r) => {
      const count = zoneCards.filter((c) => c.rank === r).length;
      return count * count;
    });
  } else {
    const specialsAvail = [];
    if (legal.includes(10)) specialsAvail.push(10);
    if (legal.includes(2)) specialsAvail.push(2);
    chosenRank = weightedChoice(specialsAvail, (r) => (r === 10 ? (pileLength >= 3 ? 3 : 1) : 2));
  }
  return zoneCards.filter((c) => c.rank === chosenRank).map((c) => c.id);
}

/** Face-down plays are blind - which one to flip is arbitrary. */
export function chooseFaceDownCardId(faceDown) {
  return faceDown[0]?.id ?? null;
}
