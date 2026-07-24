// A "mosaic" is one large monochrome picture cut into a grid of panelSize x
// panelSize squares. Each panel is solved as its own ordinary picross puzzle
// (its clues are derived only from that panel's own pixels); as panels are
// solved the overall picture assembles on the overview screen.
//
// Grids are authored as one "0"/"1" digit-string per row and validated below
// so a mis-counted row fails loudly at load time instead of silently
// drawing a lopsided picture.

const RAW_MOSAICS = [
  {
    slug: "heart",
    title: "Heart",
    color: "#e0464f",
    panelSize: 5,
    panelRows: 4,
    panelCols: 4,
    rows: [
      "00111111100111111100",
      "01111111111111111110",
      "01111111111111111110",
      "11111111111111111111",
      "11111111111111111111",
      "11111111111111111111",
      "11111111111111111111",
      "11111111111111111111",
      "11111111111111111111",
      "01111111111111111110",
      "01111111111111111110",
      "01111111111111111110",
      "00111111111111111100",
      "00011111111111111000",
      "00011111111111111000",
      "00001111111111110000",
      "00000111111111100000",
      "00000011111111000000",
      "00000000111100000000",
      "00000000011000000000",
    ],
  },
];

function parseMosaic(raw) {
  const totalRows = raw.panelRows * raw.panelSize;
  const totalCols = raw.panelCols * raw.panelSize;

  if (raw.rows.length !== totalRows) {
    throw new Error(`Mosaic "${raw.slug}" has ${raw.rows.length} rows, expected ${totalRows}`);
  }

  const grid = raw.rows.map((rowStr, r) => {
    if (rowStr.length !== totalCols) {
      throw new Error(`Mosaic "${raw.slug}" row ${r} has length ${rowStr.length}, expected ${totalCols}`);
    }
    return rowStr.split("").map((ch) => {
      if (ch !== "0" && ch !== "1") {
        throw new Error(`Mosaic "${raw.slug}" row ${r} has invalid digit "${ch}"`);
      }
      return Number(ch);
    });
  });

  const panels = [];
  for (let pr = 0; pr < raw.panelRows; pr++) {
    const panelRow = [];
    for (let pc = 0; pc < raw.panelCols; pc++) {
      const panel = [];
      for (let r = 0; r < raw.panelSize; r++) {
        const row = [];
        for (let c = 0; c < raw.panelSize; c++) {
          row.push(grid[pr * raw.panelSize + r][pc * raw.panelSize + c]);
        }
        panel.push(row);
      }
      panelRow.push(panel);
    }
    panels.push(panelRow);
  }

  return {
    slug: raw.slug,
    title: raw.title,
    color: raw.color,
    panelSize: raw.panelSize,
    panelRows: raw.panelRows,
    panelCols: raw.panelCols,
    rows: totalRows,
    cols: totalCols,
    grid,
    panels, // panels[pr][pc] -> panelSize x panelSize array of 0/1
  };
}

export const MOSAICS = RAW_MOSAICS.map(parseMosaic);

export function getMosaic(slug) {
  const mosaic = MOSAICS.find((m) => m.slug === slug);
  if (!mosaic) throw new Error(`Unknown mosaic "${slug}"`);
  return mosaic;
}
