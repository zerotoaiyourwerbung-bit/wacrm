-- ============================================================
-- 040_ai_gemini_provider
--
-- Support Google Gemini alongside OpenAI and Anthropic in ai_configs
-- and ai_usage_log.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop existing provider check constraints on ai_configs and ai_usage_log
  FOR r IN (
    SELECT conname, relname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname IN ('ai_configs', 'ai_usage_log')
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%provider%'
  ) LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.relname, r.conname);
  END LOOP;
END $$;

-- Re-create check constraints with 'gemini' included
ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'gemini'));

ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'gemini'));
