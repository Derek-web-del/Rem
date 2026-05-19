-- Better Auth JWT plugin: JWKS key row storage (SQLite).
-- Tracked by schema_version in server/auth-sqlite-migrations.mjs
CREATE TABLE IF NOT EXISTS jwks (
  id TEXT NOT NULL PRIMARY KEY,
  publicKey TEXT NOT NULL,
  privateKey TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER
);
