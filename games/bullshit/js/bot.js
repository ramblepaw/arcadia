// Bot AI for Bullshit. Two independent decisions:
//   1. choosePlay   - what to put face-down when it's the bot's turn to play.
//   2. decideChallenge - whether to call "Bullshit!" on someone else's claim.
// Bots only ever see their own hand and the public claim (rank + count) -
// never the actual cards played - so both heuristics work off imperfect
// information, same as a human would.

function weightedJunkOrder(junk) {
  const rankCounts = {};
  junk.forEach((c) => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
  // Bots prefer to dump cards from ranks they're holding several copies of -
  // those are dead weight since only one rank per turn is even needed.
  return junk.slice().sort((a, b) => (rankCounts[b.rank] - rankCounts[a.rank]) || (Math.random() - 0.5));
}

/**
 * Choose 1-4 cards to play from `hand`, claiming `requiredRank`. If the bot
 * actually holds cards of that rank it usually plays them honestly, but
 * sometimes pads the play with junk cards claimed as the same rank to dump
 * more dead weight - and when it holds none at all, it must bluff outright.
 * Returns an array of card ids.
 */
export function choosePlay(hand, requiredRank) {
  const real = hand.filter((c) => c.rank === requiredRank);
  const junk = hand.filter((c) => c.rank !== requiredRank);
  const maxCount = Math.min(4, hand.length);

  let count;
  if (real.length > 0) {
    let pad = 0;
    if (junk.length > 0 && Math.random() < 0.35) {
      pad = Math.min(junk.length, Math.random() < 0.6 ? 1 : 2, maxCount - real.length);
    }
    count = Math.min(real.length + pad, maxCount);
  } else {
    count = Math.min(1 + Math.floor(Math.random() * Math.min(3, maxCount)), maxCount);
  }
  count = Math.max(1, count);

  const chosen = real.slice(0, count);
  if (chosen.length < count) {
    const need = count - chosen.length;
    chosen.push(...weightedJunkOrder(junk).slice(0, need));
  }
  return chosen.map((c) => c.id);
}

/**
 * Decide whether to call "Bullshit!" on a pending claim. `hand` is the
 * deciding bot's own hand (used to reason about how many copies of the
 * claimed rank could plausibly be left elsewhere - only 4 of any rank
 * exist). `playerHandSizeAfterPlay` and `pileSize` shape the base suspicion:
 * a near-empty hand raises the incentive to bluff, and a bigger pile raises
 * the reward for a correct call.
 */
export function decideChallenge(hand, { claimedRank, claimedCount, playerHandSizeAfterPlay, pileSize }) {
  const knownCopies = hand.filter((c) => c.rank === claimedRank).length;

  if (knownCopies + claimedCount > 4) {
    // The math doesn't add up - this has to be a lie, but leave a sliver of
    // doubt so bots aren't perfectly predictable card-counters.
    return Math.random() < 0.92;
  }

  const countBase = { 1: 0.15, 2: 0.25, 3: 0.4, 4: 0.55 }[claimedCount] ?? 0.3;
  let p = countBase;
  if (playerHandSizeAfterPlay <= 2) p += 0.2;
  if (pileSize >= 8) p += 0.1;
  p += knownCopies * 0.08;
  p = Math.min(0.9, Math.max(0.03, p));
  return Math.random() < p;
}
