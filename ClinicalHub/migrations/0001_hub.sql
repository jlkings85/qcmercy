-- Additive only: existing QC users, passwords, sessions, and records are preserved.
CREATE TABLE IF NOT EXISTS "hub_oauthClient" (id TEXT PRIMARY KEY NOT NULL,
"clientId" TEXT NOT NULL UNIQUE,
"clientSecret" TEXT,
"clientDiscoveryId" TEXT,
"disabled" INTEGER,
"skipConsent" INTEGER,
"enableEndSession" INTEGER,
"subjectType" TEXT,
"scopes" TEXT,
"clientCredentialsScopes" TEXT,
"userId" TEXT,
"createdAt" INTEGER,
"updatedAt" INTEGER,
"name" TEXT,
"uri" TEXT,
"icon" TEXT,
"contacts" TEXT,
"tos" TEXT,
"policy" TEXT,
"softwareId" TEXT,
"softwareVersion" TEXT,
"softwareStatement" TEXT,
"redirectUris" TEXT NOT NULL,
"postLogoutRedirectUris" TEXT,
"backchannelLogoutUri" TEXT,
"backchannelLogoutSessionRequired" INTEGER,
"tokenEndpointAuthMethod" TEXT,
"applicationType" TEXT,
"jwks" TEXT,
"jwksUri" TEXT,
"grantTypes" TEXT,
"responseTypes" TEXT,
"requirePKCE" INTEGER,
"dpopBoundAccessTokens" INTEGER,
"referenceId" TEXT,
"metadata" TEXT);
CREATE INDEX IF NOT EXISTS "hub_oauthClient_userId" ON "hub_oauthClient"("userId");
CREATE TABLE IF NOT EXISTS "hub_oauthResource" (id TEXT PRIMARY KEY NOT NULL,
"identifier" TEXT NOT NULL UNIQUE,
"name" TEXT NOT NULL,
"accessTokenTtl" INTEGER,
"refreshTokenTtl" INTEGER,
"signingAlgorithm" TEXT,
"signingKeyId" TEXT,
"allowedScopes" TEXT,
"customClaims" TEXT,
"dpopBoundAccessTokensRequired" INTEGER,
"disabled" INTEGER,
"createdAt" INTEGER,
"updatedAt" INTEGER,
"policyVersion" INTEGER,
"metadata" TEXT);
CREATE TABLE IF NOT EXISTS "hub_oauthClientResource" (id TEXT PRIMARY KEY NOT NULL,
"clientId" TEXT NOT NULL,
"resourceId" TEXT NOT NULL,
"metadata" TEXT,
"createdAt" INTEGER);
CREATE INDEX IF NOT EXISTS "hub_oauthClientResource_clientId" ON "hub_oauthClientResource"("clientId");
CREATE INDEX IF NOT EXISTS "hub_oauthClientResource_resourceId" ON "hub_oauthClientResource"("resourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "hub_oauthClientResource_composite_0" ON "hub_oauthClientResource"("clientId","resourceId");
CREATE TABLE IF NOT EXISTS "hub_oauthRefreshToken" (id TEXT PRIMARY KEY NOT NULL,
"token" TEXT NOT NULL UNIQUE,
"clientId" TEXT NOT NULL,
"sessionId" TEXT,
"userId" TEXT NOT NULL,
"referenceId" TEXT,
"authorizationCodeId" TEXT,
"resources" TEXT,
"requestedUserInfoClaims" TEXT,
"expiresAt" INTEGER NOT NULL,
"createdAt" INTEGER NOT NULL,
"revoked" INTEGER,
"rotatedAt" INTEGER,
"rotationReplayResponse" TEXT,
"rotationReplayExpiresAt" INTEGER,
"authTime" INTEGER,
"confirmation" TEXT,
"scopes" TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS "hub_oauthRefreshToken_clientId" ON "hub_oauthRefreshToken"("clientId");
CREATE INDEX IF NOT EXISTS "hub_oauthRefreshToken_sessionId" ON "hub_oauthRefreshToken"("sessionId");
CREATE INDEX IF NOT EXISTS "hub_oauthRefreshToken_userId" ON "hub_oauthRefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "hub_oauthRefreshToken_authorizationCodeId" ON "hub_oauthRefreshToken"("authorizationCodeId");
CREATE TABLE IF NOT EXISTS "hub_oauthAccessToken" (id TEXT PRIMARY KEY NOT NULL,
"token" TEXT NOT NULL UNIQUE,
"clientId" TEXT NOT NULL,
"sessionId" TEXT,
"userId" TEXT,
"referenceId" TEXT,
"authorizationCodeId" TEXT,
"resources" TEXT,
"requestedUserInfoClaims" TEXT,
"refreshId" TEXT,
"expiresAt" INTEGER NOT NULL,
"createdAt" INTEGER NOT NULL,
"revoked" INTEGER,
"confirmation" TEXT,
"scopes" TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS "hub_oauthAccessToken_clientId" ON "hub_oauthAccessToken"("clientId");
CREATE INDEX IF NOT EXISTS "hub_oauthAccessToken_sessionId" ON "hub_oauthAccessToken"("sessionId");
CREATE INDEX IF NOT EXISTS "hub_oauthAccessToken_userId" ON "hub_oauthAccessToken"("userId");
CREATE INDEX IF NOT EXISTS "hub_oauthAccessToken_authorizationCodeId" ON "hub_oauthAccessToken"("authorizationCodeId");
CREATE INDEX IF NOT EXISTS "hub_oauthAccessToken_refreshId" ON "hub_oauthAccessToken"("refreshId");
CREATE TABLE IF NOT EXISTS "hub_oauthConsent" (id TEXT PRIMARY KEY NOT NULL,
"clientId" TEXT NOT NULL,
"userId" TEXT,
"referenceId" TEXT,
"resources" TEXT,
"requestedUserInfoClaims" TEXT,
"scopes" TEXT NOT NULL,
"createdAt" INTEGER NOT NULL,
"updatedAt" INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS "hub_oauthConsent_clientId" ON "hub_oauthConsent"("clientId");
CREATE INDEX IF NOT EXISTS "hub_oauthConsent_userId" ON "hub_oauthConsent"("userId");
CREATE TABLE IF NOT EXISTS "hub_oauthClientAssertion" (id TEXT PRIMARY KEY NOT NULL,
"expiresAt" INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS "hub_jwks" (id TEXT PRIMARY KEY NOT NULL,
"publicKey" TEXT NOT NULL,
"privateKey" TEXT NOT NULL,
"createdAt" INTEGER NOT NULL,
"expiresAt" INTEGER,
"alg" TEXT,
"crv" TEXT);

CREATE TABLE IF NOT EXISTS hub_members (user_id TEXT PRIMARY KEY REFERENCES auth_user(id), is_admin INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hub_grants (user_id TEXT NOT NULL REFERENCES auth_user(id), module TEXT NOT NULL, local_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, PRIMARY KEY(user_id,module), UNIQUE(module,local_id));
CREATE TABLE IF NOT EXISTS hub_audit (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, event TEXT NOT NULL, target_id TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hub_modules (id TEXT PRIMARY KEY, connected INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO hub_modules(id) VALUES ('qc'),('shifts'),('narcs'),('evals'),('guidelines');
