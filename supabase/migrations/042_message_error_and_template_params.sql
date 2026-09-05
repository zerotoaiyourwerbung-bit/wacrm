-- ============================================================
-- 042_message_error_and_template_params
--
-- Adds support for recording delivery failure reasons and template
-- parameter payloads on messages:
--   1. messages.error_message: records delivery failure reasons reported
--      by Meta's status webhooks or send-time errors.
--   2. messages.template_params: positional body/button variable values
--      used when sending template messages, enabling 1-click retry.
--   3. messages.template_language: language code used when sending template.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS template_params JSONB,
  ADD COLUMN IF NOT EXISTS template_language TEXT;

COMMENT ON COLUMN messages.error_message IS
  'Delivery failure error message from Meta Cloud API webhook or send validation.';

COMMENT ON COLUMN messages.template_params IS
  'Array of parameter values (body variables) supplied when sending a template message.';

COMMENT ON COLUMN messages.template_language IS
  'Language code used for the template send (e.g. en_US).';
