-- 013_refresh_tokens.sql
--
-- Refresh tokens were stateless JWTs: any stolen token could be used seven
-- days straight, and rotating one invalidated nothing -- the old one kept
-- working for its full lifetime. Keeping only the hash server-side makes a
-- stolen token useless against the database, and family-based revocation
-- turns "the old token came back" into "someone is replaying tokens, kill the
-- whole session line".
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id                 serial PRIMARY KEY,
  staff_account_id   integer NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  token_hash         text NOT NULL UNIQUE,
  family_id          uuid NOT NULL,
  expires_at         timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  replaced_by        integer REFERENCES refresh_tokens(id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens (family_id);

COMMENT ON TABLE refresh_tokens IS
  'Server-side registry of refresh-token hashes. One row per issued token; '
  'revoked_at is set when rotated, and presenting a revoked token revokes '
  'its whole family_id line.';
