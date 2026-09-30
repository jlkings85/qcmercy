CREATE TABLE qc_login_links (
 operator_id TEXT PRIMARY KEY REFERENCES operators(id),
 auth_user_id TEXT NOT NULL UNIQUE REFERENCES auth_user(id),
 created_at TEXT NOT NULL,
 event_id TEXT NOT NULL UNIQUE,
 invitation_id TEXT
);
CREATE TABLE qc_invitations (
 id TEXT PRIMARY KEY, operator_id TEXT NOT NULL REFERENCES operators(id),
 token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 created_by TEXT NOT NULL, used_at TEXT, revoked_at TEXT
);
CREATE UNIQUE INDEX qc_invitation_current ON qc_invitations(operator_id) WHERE used_at IS NULL AND revoked_at IS NULL;
