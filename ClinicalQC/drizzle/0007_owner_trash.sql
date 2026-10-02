CREATE TABLE IF NOT EXISTS qc_trash (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, actor_name TEXT NOT NULL,
 category TEXT NOT NULL, item_count INTEGER NOT NULL, payload TEXT NOT NULL,
 restored_at TEXT
);
CREATE TABLE IF NOT EXISTS qc_trash_guard (
 id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1)
);
