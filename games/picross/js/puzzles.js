// Mosaic picross (color nonogram) puzzles. Each grid is authored as one
// digit-string per row: "0" is background/blank, "1".."9" index into that
// puzzle's own `colors` palette (colors[0] is digit "1", colors[1] is digit
// "2", etc). Rows are validated below so a mis-counted row fails loudly at
// load time instead of silently drawing a lopsided puzzle.

const RAW_PUZZLES = [
  {
    slug: "heart",
    title: "Heart",
    difficulty: "Easy",
    colors: ["#e0464f", "#f2a6c9"],
    rows: [
      "0011001100",
      "0121111210",
      "1111111111",
      "1111111111",
      "1111111111",
      "0111111110",
      "0011111100",
      "0001111000",
      "0000110000",
      "0000000000",
    ],
  },
  {
    slug: "apple",
    title: "Apple",
    difficulty: "Easy",
    colors: ["#c0392b", "#3d9e4f", "#7a5230"],
    rows: [
      "0000330000",
      "0003320000",
      "0011111000",
      "0111111100",
      "1111111110",
      "1111111110",
      "1111111110",
      "0111111100",
      "0011111000",
      "0001110000",
    ],
  },
  {
    slug: "ghost",
    title: "Ghost",
    difficulty: "Medium",
    colors: ["#d8d2f0", "#241e3c"],
    rows: [
      "000011111110000",
      "000111111111000",
      "001111111111100",
      "011111111111110",
      "111111111111111",
      "111221111122111",
      "111221111122111",
      "111111111111111",
      "111111111111111",
      "111111111111111",
      "111111111111111",
      "111111111111111",
      "111111111111111",
      "110110110110110",
    ],
  },
  {
    slug: "rainbow",
    title: "Rainbow",
    difficulty: "Hard",
    colors: ["#d1373f", "#e08a35", "#e0c93f", "#3d9e4f", "#3d6fb5", "#7a4fc9"],
    rows: [
      "0000000000000000000",
      "0000000000000000000",
      "0000000111111100000",
      "0000000122222110000",
      "0000012233333221000",
      "0001223334443332100",
      "0012234445544433210",
      "0112344555655544321",
      "0123445666666544321",
      "0123456600000665432",
      "1233456000000065443",
      "1234556000000065543",
    ],
  },
];

function parsePuzzle(raw) {
  const width = raw.rows[0].length;
  const grid = raw.rows.map((rowStr, r) => {
    if (rowStr.length !== width) {
      throw new Error(`Picross puzzle "${raw.slug}" row ${r} has length ${rowStr.length}, expected ${width}`);
    }
    return rowStr.split("").map((ch) => {
      const n = Number(ch);
      if (Number.isNaN(n) || n > raw.colors.length) {
        throw new Error(`Picross puzzle "${raw.slug}" row ${r} has invalid digit "${ch}"`);
      }
      return n;
    });
  });
  return {
    slug: raw.slug,
    title: raw.title,
    difficulty: raw.difficulty,
    colors: raw.colors,
    rows: grid.length,
    cols: width,
    grid,
  };
}

export const PUZZLES = RAW_PUZZLES.map(parsePuzzle);

export function getPuzzle(slug) {
  const puzzle = PUZZLES.find((p) => p.slug === slug);
  if (!puzzle) throw new Error(`Unknown picross puzzle "${slug}"`);
  return puzzle;
}
