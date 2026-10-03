CREATE TABLE IF NOT EXISTS points (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    x          INTEGER NOT NULL,
    y          INTEGER,
    z          INTEGER NOT NULL,
    dimension  TEXT    NOT NULL DEFAULT 'overworld',
    note       TEXT,
    author     TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now', '+9 hours'))
);
