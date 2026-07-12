// Registry of games available in the hub. To add a new game, drop its files
// in games/<slug>/ and add one entry here. scoreDirection tells leaderboards
// whether a lower or higher score ranks first for this game.
export const GAMES = [
  {
    slug: "five-crowns",
    title: "Five Crowns",
    tagline: "11 rounds. Runs, sets, and wild kings.",
    path: "games/five-crowns/index.html",
    accent: "#e8c14a",
    scoreDirection: "asc",
  },
  {
    slug: "palace",
    title: "Palace",
    tagline: "Empty your hand first, or get stuck with the pile.",
    path: "games/palace/index.html",
    accent: "#c0392b",
    scoreDirection: "asc",
  },
  {
    slug: "pyramid",
    title: "Pyramid",
    tagline: "Clear the pyramid, one rank up or down at a time.",
    path: "games/pyramid/index.html",
    accent: "#3d6fb5",
    scoreDirection: "asc",
  },
];
