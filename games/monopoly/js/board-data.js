// Static board data for the standard 40-space board. Nothing here mutates -
// ownership/houses/mortgage state lives on Game.properties, keyed by space id.
//
// rent = [base, 1house, 2houses, 3houses, 4houses, hotel] for "property" spaces.
// Railroads/utilities have no rent table - their rent is computed in rules.js
// from how many of the group the owner holds (and, for utilities, the dice roll).

export const SPACES = [
  { id: 0, name: "GO", type: "go" },
  { id: 1, name: "Mediterranean Avenue", type: "property", group: "brown", price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50, mortgage: 30 },
  { id: 2, name: "Community Chest", type: "chest" },
  { id: 3, name: "Baltic Avenue", type: "property", group: "brown", price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50, mortgage: 30 },
  { id: 4, name: "Income Tax", type: "tax", amount: 200 },
  { id: 5, name: "Reading Railroad", type: "railroad", price: 200, mortgage: 100 },
  { id: 6, name: "Oriental Avenue", type: "property", group: "lightblue", price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, mortgage: 50 },
  { id: 7, name: "Chance", type: "chance" },
  { id: 8, name: "Vermont Avenue", type: "property", group: "lightblue", price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, mortgage: 50 },
  { id: 9, name: "Connecticut Avenue", type: "property", group: "lightblue", price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50, mortgage: 60 },
  { id: 10, name: "Jail", type: "jail" },
  { id: 11, name: "St. Charles Place", type: "property", group: "pink", price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, mortgage: 70 },
  { id: 12, name: "Electric Company", type: "utility", price: 150, mortgage: 75 },
  { id: 13, name: "States Avenue", type: "property", group: "pink", price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, mortgage: 70 },
  { id: 14, name: "Virginia Avenue", type: "property", group: "pink", price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100, mortgage: 80 },
  { id: 15, name: "Pennsylvania Railroad", type: "railroad", price: 200, mortgage: 100 },
  { id: 16, name: "St. James Place", type: "property", group: "orange", price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, mortgage: 90 },
  { id: 17, name: "Community Chest", type: "chest" },
  { id: 18, name: "Tennessee Avenue", type: "property", group: "orange", price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, mortgage: 90 },
  { id: 19, name: "New York Avenue", type: "property", group: "orange", price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100, mortgage: 100 },
  { id: 20, name: "Free Parking", type: "freeParking" },
  { id: 21, name: "Kentucky Avenue", type: "property", group: "red", price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, mortgage: 110 },
  { id: 22, name: "Chance", type: "chance" },
  { id: 23, name: "Indiana Avenue", type: "property", group: "red", price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, mortgage: 110 },
  { id: 24, name: "Illinois Avenue", type: "property", group: "red", price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150, mortgage: 120 },
  { id: 25, name: "B&O Railroad", type: "railroad", price: 200, mortgage: 100 },
  { id: 26, name: "Atlantic Avenue", type: "property", group: "yellow", price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgage: 130 },
  { id: 27, name: "Ventnor Avenue", type: "property", group: "yellow", price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgage: 130 },
  { id: 28, name: "Water Works", type: "utility", price: 150, mortgage: 75 },
  { id: 29, name: "Marvin Gardens", type: "property", group: "yellow", price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150, mortgage: 140 },
  { id: 30, name: "Go To Jail", type: "goToJail" },
  { id: 31, name: "Pacific Avenue", type: "property", group: "green", price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, mortgage: 150 },
  { id: 32, name: "North Carolina Avenue", type: "property", group: "green", price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, mortgage: 150 },
  { id: 33, name: "Community Chest", type: "chest" },
  { id: 34, name: "Pennsylvania Avenue", type: "property", group: "green", price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, mortgage: 160 },
  { id: 35, name: "Short Line", type: "railroad", price: 200, mortgage: 100 },
  { id: 36, name: "Chance", type: "chance" },
  { id: 37, name: "Park Place", type: "property", group: "darkblue", price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, mortgage: 175 },
  { id: 38, name: "Luxury Tax", type: "tax", amount: 100 },
  { id: 39, name: "Boardwalk", type: "property", group: "darkblue", price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, mortgage: 200 },
];

export const COLOR_GROUPS = {
  brown: [1, 3],
  lightblue: [6, 8, 9],
  pink: [11, 13, 14],
  orange: [16, 18, 19],
  red: [21, 23, 24],
  yellow: [26, 27, 29],
  green: [31, 32, 34],
  darkblue: [37, 39],
};

export const GROUP_COLORS = {
  brown: "#955436",
  lightblue: "#aae0fa",
  pink: "#d93a96",
  orange: "#f7941d",
  red: "#ed1b24",
  yellow: "#fef200",
  green: "#1fb25a",
  darkblue: "#0072bb",
};

export const RAILROADS = [5, 15, 25, 35];
export const UTILITIES = [12, 28];

export const BOARD_SIZE = 40;
export const HOUSE_SUPPLY = 32;
export const HOTEL_SUPPLY = 12;
export const STARTING_CASH = 1500;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const JAIL_SPACE_ID = 10;
export const GO_TO_JAIL_SPACE_ID = 30;
export const FREE_PARKING_SPACE_ID = 20;
export const MAX_JAIL_TURNS = 3;
export const MORTGAGE_INTEREST = 0.1;

export function spaceAt(id) {
  return SPACES[id];
}

export function groupOf(spaceId) {
  return SPACES[spaceId].group ?? null;
}

/** Maps a space id to its {row, col} position on an 11x11 CSS grid perimeter.
 *  id 0 (GO) is bottom-right; ids increase counter-clockwise around the board,
 *  matching the real layout: 0-10 bottom row (right->left), 10-20 left column
 *  (bottom->top), 20-30 top row (left->right), 30-39(->0) right column (top->bottom). */
export function gridPosition(spaceId) {
  if (spaceId <= 10) return { row: 11, col: 11 - spaceId };
  if (spaceId <= 20) return { row: 11 - (spaceId - 10), col: 1 };
  if (spaceId <= 30) return { row: 1, col: 1 + (spaceId - 20) };
  return { row: 1 + (spaceId - 30), col: 11 };
}

/** Which side of the board a space sits on, for orienting its label so the
 *  color band always faces the board's outer edge (like a real board) and
 *  the text reads correctly from that side of the table. Corners (0/10/20/30)
 *  aren't rotated - they render centered instead. */
export function edgeOf(spaceId) {
  if (spaceId > 0 && spaceId < 10) return "bottom";
  if (spaceId > 10 && spaceId < 20) return "left";
  if (spaceId > 20 && spaceId < 30) return "top";
  if (spaceId > 30 && spaceId < 40) return "right";
  return "corner";
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
