CREATE TABLE pb_state (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency        INTEGER NOT NULL DEFAULT 500,
  current_location TEXT NOT NULL DEFAULT 'meadow',
  inventory       TEXT NOT NULL DEFAULT '{}',
  last_tick_at    TEXT NOT NULL DEFAULT (datetime('now')),
  recent_events   TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pb_pens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  biome      TEXT NOT NULL,
  built_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pb_pens_user_id ON pb_pens(user_id);

CREATE TABLE pb_pokemon (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  species_key      TEXT NOT NULL,
  gender           TEXT NOT NULL CHECK (gender IN ('male', 'female', 'genderless')),
  nature           TEXT NOT NULL,
  ivs              TEXT NOT NULL,
  is_shiny         INTEGER NOT NULL DEFAULT 0,
  held_item        TEXT,
  origin           TEXT NOT NULL CHECK (origin IN ('starter', 'bred', 'encounter', 'shop')),
  origin_location  TEXT,
  obtained_at      TEXT NOT NULL DEFAULT (datetime('now')),
  happiness        INTEGER NOT NULL DEFAULT 0,
  last_fed_at      TEXT,
  current_pen_id   INTEGER REFERENCES pb_pens(id) ON DELETE SET NULL,
  on_display       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_pb_pokemon_user_id ON pb_pokemon(user_id);
CREATE INDEX idx_pb_pokemon_pen_id ON pb_pokemon(current_pen_id);

CREATE TABLE pb_pen_egg (
  pen_id          INTEGER PRIMARY KEY REFERENCES pb_pens(id) ON DELETE CASCADE,
  species_key     TEXT NOT NULL,
  gender          TEXT NOT NULL CHECK (gender IN ('male', 'female', 'genderless')),
  nature          TEXT NOT NULL,
  ivs             TEXT NOT NULL,
  is_shiny        INTEGER NOT NULL DEFAULT 0,
  progress_steps  INTEGER NOT NULL DEFAULT 0,
  steps_required  INTEGER NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pb_shop_state (
  singleton_id      INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  last_refreshed_at TEXT NOT NULL DEFAULT ('1970-01-01T00:00:00Z')
);

CREATE TABLE pb_shop (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  species_key  TEXT NOT NULL,
  gender       TEXT NOT NULL CHECK (gender IN ('male', 'female', 'genderless')),
  nature       TEXT NOT NULL,
  ivs          TEXT NOT NULL,
  is_shiny     INTEGER NOT NULL DEFAULT 0,
  price        INTEGER NOT NULL,
  listed_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pb_request_state (
  singleton_id      INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  last_refreshed_at TEXT NOT NULL DEFAULT ('1970-01-01T00:00:00Z')
);

CREATE TABLE pb_requests (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  species_key          TEXT NOT NULL,
  criteria             TEXT NOT NULL DEFAULT '{}',
  reward               INTEGER NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  fulfilled_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  fulfilled_at         TEXT
);
CREATE INDEX idx_pb_requests_open ON pb_requests(fulfilled_at);
