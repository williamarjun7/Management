-- ============================================================
-- MIGRATION: Add missing check_idempotency_strict and mark_idempotency
-- ============================================================
-- These functions are referenced by every idempotent RPC but were
-- never defined in any migration. Fixes errors like:
--   "function check_idempotency_strict(text, unknown) does not exist"
-- ============================================================

-- Ensure the idempotency_keys table exists
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key_hash text NOT NULL,
  operation text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key_hash, operation)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_key_operation
  ON public.idempotency_keys(key_hash, operation);

-- Check idempotency: returns the cached jsonb result if the key+operation already exists
CREATE OR REPLACE FUNCTION check_idempotency_strict(
  p_idempotency_key text,
  p_operation text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT result INTO v_result
  FROM public.idempotency_keys
  WHERE key_hash = encode(digest(p_idempotency_key, 'sha256'), 'hex')
    AND operation = p_operation;
  RETURN v_result;
END;
$$;

-- Mark idempotency: writes the ledger entry for a key+operation+result
CREATE OR REPLACE FUNCTION mark_idempotency(
  p_idempotency_key text,
  p_operation text,
  p_result jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  INSERT INTO public.idempotency_keys (key_hash, operation, result)
  VALUES (encode(digest(p_idempotency_key, 'sha256'), 'hex'), p_operation, p_result)
  ON CONFLICT (key_hash, operation) DO UPDATE SET result = p_result;
END;
$$;
