-- 041_google_sheets_triggers.sql
-- Adds support for Google Sheets as an automation trigger source.
-- Two tables:
--   google_oauth_tokens  – stores per-account OAuth2 refresh tokens
--   google_sheets_poll_state – tracks last-seen state per automation

-- ================================================================
-- 1. Google OAuth tokens (per account)
-- ================================================================
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  scope        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id)
);

ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Service-role only access. OAuth tokens are written by the server-side
-- callback route using the admin client; no direct client access needed.
CREATE POLICY "google_oauth_tokens_select"
  ON google_oauth_tokens FOR SELECT
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "google_oauth_tokens_insert"
  ON google_oauth_tokens FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "google_oauth_tokens_update"
  ON google_oauth_tokens FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "google_oauth_tokens_delete"
  ON google_oauth_tokens FOR DELETE
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ================================================================
-- 2. Poll state per automation
-- ================================================================
CREATE TABLE IF NOT EXISTS google_sheets_poll_state (
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  last_row_count  INT NOT NULL DEFAULT 0,
  last_hash       TEXT,
  last_polled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (automation_id)
);

ALTER TABLE google_sheets_poll_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_sheets_poll_state_select"
  ON google_sheets_poll_state FOR SELECT
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "google_sheets_poll_state_insert"
  ON google_sheets_poll_state FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "google_sheets_poll_state_update"
  ON google_sheets_poll_state FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "google_sheets_poll_state_delete"
  ON google_sheets_poll_state FOR DELETE
  USING (auth.jwt() ->> 'role' = 'service_role');