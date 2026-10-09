CREATE TABLE IF NOT EXISTS hub_people (
 user_id TEXT PRIMARY KEY REFERENCES auth_user(id),
 phone TEXT NOT NULL DEFAULT '', employee_id TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hub_setup_links (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_user(id), token_hash TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS hub_setup_current ON hub_setup_links(user_id) WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS hub_provision_locks (user_id TEXT NOT NULL,module TEXT NOT NULL,token TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(user_id,module));
