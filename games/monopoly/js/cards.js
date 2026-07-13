// Standard 16-card Chance and Community Chest decks. Each card's `effect` is
// a small tagged object interpreted by Game#applyCardEffect (game.js) - this
// module only owns the data and the draw-pile mechanics, no game state.
//
// effect.type one of:
//   advanceTo(spaceId)          - move directly to a space (passing GO pays $200 as usual)
//   advanceToNearest(kind, rentMultiplier) - move to nearest railroad/utility, forcing a
//                                  rent multiplier on landing if it's owned by someone else
//   moveBy(spaces)               - relative move (can be negative), no GO bonus
//   goToJail
//   getOutOfJailFree
//   collect(amount)
//   pay(amount)
//   payEachPlayer(amount)
//   collectFromEachPlayer(amount)
//   repairs(perHouse, perHotel)

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const CHANCE_CARDS = [
  { id: "ch-1", text: "Advance to GO (Collect $200)", effect: { type: "advanceTo", spaceId: 0 } },
  { id: "ch-2", text: "Advance to Illinois Avenue. If you pass GO, collect $200", effect: { type: "advanceTo", spaceId: 24 } },
  { id: "ch-3", text: "Advance to St. Charles Place. If you pass GO, collect $200", effect: { type: "advanceTo", spaceId: 11 } },
  { id: "ch-4", text: "Advance to the nearest Utility. If unowned, you may buy it. If owned, throw dice and pay owner 10x the amount thrown.", effect: { type: "advanceToNearest", kind: "utility", rentMultiplier: 10 } },
  { id: "ch-5", text: "Advance to the nearest Railroad. If unowned, you may buy it. If owned, pay owner twice the normal rent.", effect: { type: "advanceToNearest", kind: "railroad", rentMultiplier: 2 } },
  { id: "ch-6", text: "Bank pays you dividend of $50", effect: { type: "collect", amount: 50 } },
  { id: "ch-7", text: "Get Out of Jail Free. This card may be kept until needed.", effect: { type: "getOutOfJailFree" } },
  { id: "ch-8", text: "Go Back 3 Spaces", effect: { type: "moveBy", spaces: -3 } },
  { id: "ch-9", text: "Go to Jail. Go directly to Jail, do not pass GO, do not collect $200", effect: { type: "goToJail" } },
  { id: "ch-10", text: "Make general repairs on your property. For each house pay $25, for each hotel $100", effect: { type: "repairs", perHouse: 25, perHotel: 100 } },
  { id: "ch-11", text: "Pay poor tax of $15", effect: { type: "pay", amount: 15 } },
  { id: "ch-12", text: "Take a trip to Reading Railroad. If you pass GO, collect $200", effect: { type: "advanceTo", spaceId: 5 } },
  { id: "ch-13", text: "Take a walk on the Boardwalk. Advance to Boardwalk", effect: { type: "advanceTo", spaceId: 39 } },
  { id: "ch-14", text: "You have been elected Chairman of the Board. Pay each player $50", effect: { type: "payEachPlayer", amount: 50 } },
  { id: "ch-15", text: "Your building loan matures. Collect $150", effect: { type: "collect", amount: 150 } },
  { id: "ch-16", text: "You have won a crossword competition. Collect $100", effect: { type: "collect", amount: 100 } },
];

export const CHEST_CARDS = [
  { id: "cc-1", text: "Advance to GO (Collect $200)", effect: { type: "advanceTo", spaceId: 0 } },
  { id: "cc-2", text: "Bank error in your favor. Collect $200", effect: { type: "collect", amount: 200 } },
  { id: "cc-3", text: "Doctor's fees. Pay $50", effect: { type: "pay", amount: 50 } },
  { id: "cc-4", text: "From sale of stock you get $50", effect: { type: "collect", amount: 50 } },
  { id: "cc-5", text: "Get Out of Jail Free. This card may be kept until needed.", effect: { type: "getOutOfJailFree" } },
  { id: "cc-6", text: "Go to Jail. Go directly to Jail, do not pass GO, do not collect $200", effect: { type: "goToJail" } },
  { id: "cc-7", text: "Holiday fund matures. Receive $100", effect: { type: "collect", amount: 100 } },
  { id: "cc-8", text: "Income tax refund. Collect $20", effect: { type: "collect", amount: 20 } },
  { id: "cc-9", text: "It is your birthday. Collect $10 from every player", effect: { type: "collectFromEachPlayer", amount: 10 } },
  { id: "cc-10", text: "Life insurance matures. Collect $100", effect: { type: "collect", amount: 100 } },
  { id: "cc-11", text: "Pay hospital fees of $100", effect: { type: "pay", amount: 100 } },
  { id: "cc-12", text: "Pay school fees of $50", effect: { type: "pay", amount: 50 } },
  { id: "cc-13", text: "Receive $25 consultancy fee", effect: { type: "collect", amount: 25 } },
  { id: "cc-14", text: "You are assessed for street repair. $40 per house, $115 per hotel", effect: { type: "repairs", perHouse: 40, perHotel: 115 } },
  { id: "cc-15", text: "You have won second prize in a beauty contest. Collect $10", effect: { type: "collect", amount: 10 } },
  { id: "cc-16", text: "You inherit $100", effect: { type: "collect", amount: 100 } },
];

export function newDeckState(cards) {
  return { drawPile: shuffle(cards), discardPile: [] };
}

/** Draws the top card, reshuffling the discard pile back in if the draw pile
 *  is empty. Get Out of Jail Free cards are the caller's responsibility to
 *  withhold from the discard pile while a player holds one (see game.js). */
export function drawCard(deckState) {
  if (deckState.drawPile.length === 0) {
    deckState.drawPile = shuffle(deckState.discardPile);
    deckState.discardPile = [];
  }
  const card = deckState.drawPile.shift();
  return card;
}

export function discardCard(deckState, card) {
  deckState.discardPile.push(card);
}
