/**
 * Row shape for the Better Auth JWT plugin `jwks` table (PostgreSQL).
 * Aligns with the JWT plugin schema: publicKey, privateKey, createdAt, expiresAt,
 * plus string `id` primary key added by Better Auth migrations.
 */
export interface JwksRow {
  id: string
  publicKey: string
  privateKey: string
  createdAt: Date
  expiresAt: Date | null
}
