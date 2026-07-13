// The fixed claim sequence for Cheat: every play must claim the next rank
// in this cycle, regardless of whether the claim turns out to be true. It
// wraps around forever (Ace follows King).

export const RANK_SEQUENCE = [14, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function requiredRankAt(sequenceIndex) {
  return RANK_SEQUENCE[sequenceIndex % RANK_SEQUENCE.length];
}
