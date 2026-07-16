// Bot AI for Cheat. Two independent decisions:
//   1. choosePlay   - what to put face-down when it's the bot's turn to play.
//   2. decideChallenge - whether to call "Cheat!" on someone else's claim.
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
 * Decide whether to call "Cheat!" on a pending claim. `hand` is the
 * deciding bot's own hand (used to reason about how many copies of the
 * claimed rank could plausibly be left elsewhere - only 4 of any rank
 * exist). `playerHandSizeAfterPlay` and `pileSize` shape the base suspicion:
 * a near-empty hand raises the incentive to bluff, and a bigger pile raises
 * the reward for a correct call. `challengerCount` is how many players get a
 * shot at this same claim - each individual bot has to stay well under the
 * per-play base rate, or the combined odds across every challenger make
 * bluffing essentially impossible the moment there's more than one bot.
 */
export function decideChallenge(hand, { claimedRank, claimedCount, playerHandSizeAfterPlay, pileSize, challengerCount = 1 }) {
  const knownCopies = hand.filter((c) => c.rank === claimedRank).length;

  if (knownCopies + claimedCount > 4) {
    // The math doesn't add up - this has to be a lie, but leave real room
    // for a missed read rather than turning every bot into a perfect
    // card-counter that solves the game on the spot.
    return Math.random() < 0.7;
  }

  const countBase = { 1: 0.06, 2: 0.11, 3: 0.18, 4: 0.26 }[claimedCount] ?? 0.15;
  let p = countBase;
  if (playerHandSizeAfterPlay <= 2) p += 0.1;
  if (pileSize >= 10) p += 0.05;
  p += knownCopies * 0.05;
  // Damp by sqrt(challengerCount) rather than leaving it uncorrected, so the
  // chance of getting caught by *someone* grows gently with more players
  // instead of compounding toward a near-certain catch.
  p /= Math.sqrt(Math.max(1, challengerCount));
  p = Math.min(0.8, Math.max(0.02, p));
  return Math.random() < p;
}
