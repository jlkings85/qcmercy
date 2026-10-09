CREATE TABLE IF NOT EXISTS hub_site_roles(user_id TEXT NOT NULL REFERENCES auth_user(id),module TEXT NOT NULL CHECK(module IN ('forms','credentials')),role TEXT NOT NULL CHECK(role IN ('admin','member')),PRIMARY KEY(user_id,module));
INSERT OR IGNORE INTO hub_modules(id) VALUES('forms'),('credentials');
