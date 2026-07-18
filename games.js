// Registry of games available in the hub. To add a new game, drop its files
// in games/<slug>/ and add one entry here. scoreDirection tells leaderboards
// whether a lower or higher score ranks first for this game. leaderboardMetric
// is optional and defaults to "score" (ranks by best score); set it to
// "winRate" to rank by win percentage instead - useful for solitaire-style
// games where "score" (e.g. cards left over) isn't the most meaningful stat.
// icon is inline SVG markup shown on the hub tile - use stroke/fill
// "currentColor" so it picks up the tile's --accent color automatically.
const ICON_ATTRS = `viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

export const GAMES = [
  {
    slug: "five-crowns",
    title: "Five Crowns",
    tagline: "11 rounds. Runs, sets, and wild kings.",
    path: "games/five-crowns/index.html",
    accent: "#e8c14a",
    scoreDirection: "asc",
    icon: `<svg ${ICON_ATTRS}>
      <path d="M8 34 L8 20 L16 28 L24 14 L32 28 L40 20 L40 34 Z"/>
      <path d="M8 34 L40 34"/>
      <circle cx="8" cy="20" r="1.6" fill="currentColor" stroke="none"/>
      <circle cx="24" cy="14" r="1.6" fill="currentColor" stroke="none"/>
      <circle cx="40" cy="20" r="1.6" fill="currentColor" stroke="none"/>
    </svg>`,
  },
  {
    slug: "palace",
    title: "Palace",
    tagline: "Empty your hand first, or get stuck with the pile.",
    path: "games/palace/index.html",
    accent: "#c0392b",
    scoreDirection: "asc",
    leaderboardMetric: "winRate",
    icon: `<svg ${ICON_ATTRS}>
      <rect x="9" y="14" width="20" height="28" rx="2" transform="rotate(-8 19 28)"/>
      <rect x="19" y="14" width="20" height="28" rx="2" transform="rotate(8 29 28)"/>
    </svg>`,
  },
  {
    slug: "pyramid",
    title: "Pyramid",
    tagline: "Clear the pyramid, one rank up or down at a time.",
    path: "games/pyramid/index.html",
    accent: "#3d6fb5",
    scoreDirection: "asc",
    leaderboardMetric: "winRate",
    icon: `<svg ${ICON_ATTRS}>
      <rect x="21" y="6" width="6" height="9" rx="1"/>
      <rect x="15" y="17" width="6" height="9" rx="1"/>
      <rect x="27" y="17" width="6" height="9" rx="1"/>
      <rect x="9" y="28" width="6" height="9" rx="1"/>
      <rect x="21" y="28" width="6" height="9" rx="1"/>
      <rect x="33" y="28" width="6" height="9" rx="1"/>
    </svg>`,
  },
  {
    slug: "minesweeper",
    title: "Minesweeper",
    tagline: "Clear the field without setting off a mine.",
    path: "games/minesweeper/index.html",
    accent: "#a06bf0",
    scoreDirection: "asc",
    leaderboardMetric: "winRate",
    icon: `<svg ${ICON_ATTRS}>
      <rect x="6" y="6" width="36" height="36" rx="2"/>
      <path d="M18 6 L18 42"/>
      <path d="M30 6 L30 42"/>
      <path d="M6 18 L42 18"/>
      <path d="M6 30 L42 30"/>
      <path d="M24 22 L24 34"/>
      <path d="M24 22 L32 25.5 L24 29 Z" fill="currentColor" stroke="none"/>
    </svg>`,
  },
  {
    slug: "cheat",
    title: "Cheat",
    tagline: "Bluff your cards away. Call it, or trust it.",
    path: "games/cheat/index.html",
    accent: "#e07b39",
    scoreDirection: "asc",
    leaderboardMetric: "winRate",
    icon: `<svg ${ICON_ATTRS}>
      <rect x="12" y="8" width="24" height="32" rx="2"/>
      <path d="M17 24 Q24 18 31 24"/>
      <path d="M17 24 Q24 30 31 24"/>
      <circle cx="24" cy="24" r="2" fill="currentColor" stroke="none"/>
    </svg>`,
  },
  {
    slug: "klondike",
    title: "Klondike",
    tagline: "Build the foundations, Ace to King, one careful move at a time.",
    path: "games/klondike/index.html",
    accent: "#2e9e5b",
    scoreDirection: "desc",
    leaderboardMetric: "winRate",
    icon: `<svg ${ICON_ATTRS}>
      <rect x="7" y="7" width="18" height="12" rx="2"/>
      <rect x="7" y="15" width="18" height="12" rx="2"/>
      <rect x="7" y="23" width="18" height="12" rx="2"/>
      <rect x="30" y="7" width="11" height="15" rx="2"/>
    </svg>`,
  },
  {
    slug: "spider",
    title: "Spider",
    tagline: "Build King-to-Ace runs of the same suit to clear the tableau.",
    path: "games/spider/index.html",
    accent: "#6b2d5c",
    scoreDirection: "desc",
    leaderboardMetric: "winRate",
    icon: `<svg ${ICON_ATTRS}>
      <circle cx="24" cy="24" r="6"/>
      <path d="M19 19 L10 10"/>
      <path d="M18 24 L6 20"/>
      <path d="M19 29 L10 38"/>
      <path d="M29 19 L38 10"/>
      <path d="M30 24 L42 20"/>
      <path d="M29 29 L38 38"/>
      <path d="M22 19 L16 8"/>
      <path d="M26 19 L32 8"/>
    </svg>`,
  },
  {
    slug: "freecell",
    title: "FreeCell",
    tagline: "Every card face-up. No luck left to blame but yours.",
    path: "games/freecell/index.html",
    accent: "#1f9e8f",
    scoreDirection: "desc",
    leaderboardMetric: "winRate",
    icon: `<svg ${ICON_ATTRS}>
      <rect x="4" y="10" width="9" height="12" rx="1.5"/>
      <rect x="15" y="10" width="9" height="12" rx="1.5"/>
      <rect x="26" y="10" width="9" height="12" rx="1.5"/>
      <rect x="37" y="10" width="9" height="12" rx="1.5"/>
      <rect x="15" y="26" width="9" height="14" rx="1.5"/>
    </svg>`,
  },
  {
    slug: "monopoly",
    title: "Monopoly",
    tagline: "Buy it up, build it out, bankrupt everyone else.",
    path: "games/monopoly/index.html",
    accent: "#c9a227",
    scoreDirection: "asc",
    leaderboardMetric: "winRate",
    icon: `<svg ${ICON_ATTRS}>
      <rect x="6" y="6" width="16" height="16" rx="3"/>
      <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="18" cy="10" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="10" cy="18" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="18" cy="18" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="14" cy="14" r="1.4" fill="currentColor" stroke="none"/>
      <path d="M26 42 L26 26 L34 20 L42 26 L42 42 Z"/>
      <path d="M26 42 L42 42"/>
    </svg>`,
  },
  {
    slug: "backrooms-chess",
    title: "Backrooms Chess",
    tagline: "Noclip into a shifting liminal maze. Chess pieces hunt you through the dark.",
    path: "games/backrooms-chess/index.html",
    accent: "#a13a1f",
    scoreDirection: "desc",
    icon: `<svg ${ICON_ATTRS}>
      <rect x="4" y="4" width="40" height="40" rx="2" opacity="0.35"/>
      <path d="M4 16 L20 16" opacity="0.35"/>
      <path d="M28 4 L28 20" opacity="0.35"/>
      <path d="M20 28 L44 28" opacity="0.35"/>
      <path d="M16 28 L16 44" opacity="0.35"/>
      <path d="M24 8 L24 12"/>
      <path d="M20 10 L28 10"/>
      <path d="M18 34 L20 22 L28 22 L30 34 Z"/>
      <path d="M16 34 L32 34"/>
      <path d="M16 38 L32 38"/>
    </svg>`,
  },
];
