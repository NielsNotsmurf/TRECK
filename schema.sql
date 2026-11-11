CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_id TEXT NOT NULL,
  date TEXT NOT NULL,
  product TEXT NOT NULL,
  portion TEXT,
  kcal INTEGER NOT NULL,
  protein_g INTEGER,
  carbs_g INTEGER,
  fat_g INTEGER,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_date ON items(date);
