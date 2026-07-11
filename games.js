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
];
