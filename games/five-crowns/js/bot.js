import { evaluateHand } from "./rules.js";
import { isWildCard } from "./deck.js";

/** Should the bot take the discard pile's top card instead of drawing blind from stock? */
export function shouldTakeDiscard(hand, discardTop, wildRank) {
  if (!discardTop) return false;
  const currentBest = evaluateHand(hand, wildRank).deadwoodValue;

  const withCard = [...hand, discardTop];
  let bestAfterDiscard = Infinity;
  for (const candidate of withCard) {
    if (candidate.id === discardTop.id) continue; // can't discard what we just picked up
    const trial = withCard.filter((c) => c.id !== candidate.id);
    const val = evaluateHand(trial, wildRank).deadwoodValue;
    if (val < bestAfterDiscard) bestAfterDiscard = val;
  }

  if (isWildCard(discardTop, wildRank)) {
    return bestAfterDiscard <= currentBest;
  }
  return bestAfterDiscard < currentBest;
}

/**
 * Given the post-draw hand, choose which card to discard (never the
 * just-picked-up discard card). Among discards that tie on resulting
 * deadwood - common with the small hands in early rounds - prefers to keep
 * wild cards in hand rather than a non-wild one, since a wild is strictly
 * more useful on future turns (it can complete any meld, not just one).
 */
export function chooseDiscard(hand, wildRank, forbiddenCardId) {
  let best = null;
  let bestVal = Infinity;
  for (const candidate of hand) {
    if (forbiddenCardId && candidate.id === forbiddenCardId) continue;
    const trial = hand.filter((c) => c.id !== candidate.id);
    const val = evaluateHand(trial, wildRank).deadwoodValue;
    const candidateIsWild = isWildCard(candidate, wildRank);
    const betterStrictly = val < bestVal;
    const betterOnTie = val === bestVal && best && !candidateIsWild && isWildCard(best, wildRank);
    if (betterStrictly || betterOnTie) {
      bestVal = val;
      best = candidate;
    }
  }
  return best;
}

export function botDecideDraw(hand, discardTop, wildRank) {
  return shouldTakeDiscard(hand, discardTop, wildRank) ? "discard" : "stock";
}
