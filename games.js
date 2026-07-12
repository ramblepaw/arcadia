// Registry of games available in the hub. To add a new game, drop its files
// in games/<slug>/ and add one entry here. scoreDirection tells leaderboards
// whether a lower or higher score ranks first for this game. leaderboardMetric
// is optional and defaults to "score" (ranks by best score); set it to
// "winRate" to rank by win percentage instead - useful for solitaire-style
// games where "score" (e.g. cards left over) isn't the most meaningful stat.
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
    leaderboardMetric: "winRate",
  },
  {
    slug: "pyramid",
    title: "Pyramid",
    tagline: "Clear the pyramid, one rank up or down at a time.",
    path: "games/pyramid/index.html",
    accent: "#3d6fb5",
    scoreDirection: "asc",
    leaderboardMetric: "winRate",
  },
  {
    slug: "minesweeper",
    title: "Minesweeper",
    tagline: "Clear the field without setting off a mine.",
    path: "games/minesweeper/index.html",
    accent: "#a06bf0",
    scoreDirection: "asc",
    leaderboardMetric: "winRate",
  },
  {
    slug: "bullshit",
    title: "Bullshit",
    tagline: "Bluff your cards away. Call it, or trust it.",
    path: "games/bullshit/index.html",
    accent: "#e07b39",
    scoreDirection: "asc",
    leaderboardMetric: "winRate",
  },
];
