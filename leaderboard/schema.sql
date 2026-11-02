CREATE TABLE IF NOT EXISTS scores (
  id   TEXT PRIMARY KEY,          -- random per-install player id
  tag  TEXT NOT NULL,
  best INTEGER NOT NULL,
  at   INTEGER NOT NULL           -- unix ms of last update
);
CREATE INDEX IF NOT EXISTS scores_best ON scores (best DESC);
