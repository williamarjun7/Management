-- ============================================================
-- Migration 001: POS Sync Hardening
-- Adds idempotency, loop prevention, circuit breaker, and
-- atomic conflict handling infrastructure.
-- Run via: insforge db execute -f migrations/001_sync_hardening.sql
-- ============================================================

-- 1. Propagation columns for sync_logs
ALTER TABLE public.sync_logs
  ADD COLUMN IF NOT EXISTS origin_system text,
  ADD COLUMN IF NOT EXISTS trace_id text,
  ADD COLUMN IF NOT EXISTS parent_event_id text;

-- 2. Propagation + dead-letter columns for sync_queue
ALTER TABLE public.sync_queue
  ADD COLUMN IF NOT EXISTS origin_system text,
  ADD COLUMN IF NOT EXISTS trace_id text,
  ADD COLUMN IF NOT EXISTS parent_event_id text,
  ADD COLUMN IF NOT EXISTS dead_letter_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_letter_reason text;

-- 3. Idempotency keys table (three-phase reserve/execute/complete)
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key_hash text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'failed')),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  response jsonb,
  status_code int,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_keys_pkey PRIMARY KEY (id),
  CONSTRAINT idempotency_keys_key_hash_key UNIQUE (key_hash)
);

-- 4. Room mappings unique constraints
ALTER TABLE public.room_mappings
  ADD CONSTRAINT IF NOT EXISTS uk_room_mappings_website_room UNIQUE (website_room_id);

ALTER TABLE public.room_mappings
  ADD CONSTRAINT IF NOT EXISTS uk_room_mappings_pos_room UNIQUE (pos_room_id);

-- 5. External bookings unique index for upsert safety
CREATE UNIQUE INDEX IF NOT EXISTS idx_external_bookings_pos_source
  ON public.external_bookings(pos_booking_id, source)
  WHERE pos_booking_id IS NOT NULL;

-- 6. Circuit breaker state table (persists across edge function cold starts)
CREATE TABLE IF NOT EXISTS public.sync_circuit_state (
  id text PRIMARY KEY DEFAULT 'website_outbound',
  state text NOT NULL DEFAULT 'CLOSED' CHECK (state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failure_count int NOT NULL DEFAULT 0,
  last_failure_at timestamptz,
  open_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RPC: reserve_idempotency_key
-- Atomically reserves an idempotency key for three-phase processing.
-- Returns:
--   {status: 'reserved', action: 'proceed'} — new reservation, continue
--   {status: 'completed', action: 'replay', response, status_code} — already done
--   {status: 'reserved', action: 'conflict'} — another request in flight
-- ============================================================
CREATE OR REPLACE FUNCTION public.reserve_idempotency_key(
  p_key_hash text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_record public.idempotency_keys;
BEGIN
  INSERT INTO public.idempotency_keys (key_hash, idempotency_key, status, reserved_at)
  VALUES (p_key_hash, p_idempotency_key, 'reserved', now())
  ON CONFLICT (key_hash) DO UPDATE SET
    status = 'reserved',
    reserved_at = now(),
    executed_at = NULL,
    response = NULL,
    status_code = NULL,
    error_message = NULL
  WHERE idempotency_keys.status = 'failed'
  RETURNING * INTO v_record;

  IF v_record.id IS NOT NULL AND v_record.status = 'reserved' THEN
    RETURN jsonb_build_object('status', 'reserved', 'action', 'proceed');
  END IF;

  SELECT * INTO v_record FROM public.idempotency_keys WHERE key_hash = p_key_hash;

  IF v_record.status = 'completed' THEN
    RETURN jsonb_build_object(
      'status', 'completed', 'action', 'replay',
      'response', v_record.response, 'status_code', v_record.status_code
    );
  END IF;

  RETURN jsonb_build_object('status', v_record.status, 'action', 'conflict');
END;
$$;

-- ============================================================
-- RPC: complete_idempotency_key
-- Marks a reserved key as completed with cached response.
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_idempotency_key(
  p_key_hash text,
  p_response jsonb DEFAULT NULL,
  p_status_code int DEFAULT 200
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.idempotency_keys
  SET status = 'completed',
      executed_at = now(),
      response = p_response,
      status_code = p_status_code
  WHERE key_hash = p_key_hash AND status = 'reserved';
END;
$$;

-- ============================================================
-- RPC: fail_idempotency_key
-- Marks a reserved key as failed with error message.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fail_idempotency_key(
  p_key_hash text,
  p_error text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.idempotency_keys
  SET status = 'failed',
      executed_at = now(),
      error_message = p_error
  WHERE key_hash = p_key_hash AND status = 'reserved';
END;
$$;

-- ============================================================
-- RPC: external_bookings_upsert
-- Safely upserts an external booking link using UNIQUE constraint.
-- ============================================================
CREATE OR REPLACE FUNCTION public.external_bookings_upsert(
  p_pos_booking_id uuid,
  p_source text,
  p_external_booking_id text DEFAULT NULL,
  p_sync_status text DEFAULT 'pending'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.external_bookings
    (pos_booking_id, source, external_booking_id, last_sync_status, last_sync_at)
  VALUES
    (p_pos_booking_id, p_source, p_external_booking_id, p_sync_status, now())
  ON CONFLICT (pos_booking_id, source)
  DO UPDATE SET
    external_booking_id = COALESCE(p_external_booking_id, external_bookings.external_booking_id),
    last_sync_status = p_sync_status,
    last_sync_at = now();
END;
$$;

-- ============================================================
-- RPC: get_availability_for_dates
-- Atomic availability check with conflict details.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_availability_for_dates(
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_exclude_booking_id uuid DEFAULT NULL
) RETURNS TABLE(available boolean, conflicts jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.room_id = p_room_id
        AND b.status IN ('confirmed', 'checked_in')
        AND b.check_in < p_check_out::date
        AND b.check_out > p_check_in::date
        AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
    ) AS available,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'guest_name', b.guest_name,
          'check_in', b.check_in,
          'check_out', b.check_out
        )
      )
      FROM public.bookings b
      WHERE b.room_id = p_room_id
        AND b.status IN ('confirmed', 'checked_in')
        AND b.check_in < p_check_out::date
        AND b.check_out > p_check_in::date
        AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)),
      '[]'::jsonb
    ) AS conflicts;
END;
$$;

-- ============================================================
-- RPC: log_sync_entry_v2
-- Existing log_sync_entry with added propagation fields.
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_sync_entry_v2(
  p_direction text,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_external_id text DEFAULT NULL,
  p_status text DEFAULT 'pending',
  p_request_body jsonb DEFAULT NULL,
  p_response_body jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_origin_system text DEFAULT NULL,
  p_trace_id text DEFAULT NULL,
  p_parent_event_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.sync_logs (
    direction, event_type, entity_type, entity_id, external_id,
    status, request_body, response_body, error_message,
    source, idempotency_key,
    origin_system, trace_id, parent_event_id,
    retry_count, max_retries, last_synced_at
  ) VALUES (
    p_direction, p_event_type, p_entity_type, p_entity_id, p_external_id,
    p_status, p_request_body, p_response_body, p_error_message,
    p_source, p_idempotency_key,
    p_origin_system, p_trace_id, p_parent_event_id,
    0, 5, now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================
-- RPCs: Circuit breaker
-- ============================================================

-- check_circuit_breaker: returns true if circuit is OPEN
CREATE OR REPLACE FUNCTION public.check_circuit_breaker(
  p_circuit_id text DEFAULT 'website_outbound'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_record public.sync_circuit_state;
BEGIN
  SELECT * INTO v_record FROM public.sync_circuit_state WHERE id = p_circuit_id;

  IF v_record.id IS NULL THEN
    RETURN false;
  END IF;

  IF v_record.state = 'OPEN' AND v_record.open_until IS NOT NULL AND v_record.open_until <= now() THEN
    UPDATE public.sync_circuit_state
    SET state = 'HALF_OPEN', updated_at = now()
    WHERE id = p_circuit_id;
    RETURN false;
  END IF;

  RETURN v_record.state = 'OPEN';
END;
$$;

-- record_circuit_failure: increments failure count, opens circuit if threshold exceeded
CREATE OR REPLACE FUNCTION public.record_circuit_failure(
  p_circuit_id text DEFAULT 'website_outbound',
  p_failure_threshold int DEFAULT 3,
  p_open_timeout_seconds int DEFAULT 60
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_record public.sync_circuit_state;
BEGIN
  INSERT INTO public.sync_circuit_state (id, state, failure_count, last_failure_at, updated_at)
  VALUES (p_circuit_id, 'CLOSED', 1, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    failure_count = CASE
      WHEN sync_circuit_state.state = 'HALF_OPEN' THEN 1
      ELSE sync_circuit_state.failure_count + 1
    END,
    last_failure_at = now(),
    updated_at = now()
  RETURNING * INTO v_record;

  IF v_record.failure_count >= p_failure_threshold OR v_record.state = 'HALF_OPEN' THEN
    UPDATE public.sync_circuit_state
    SET state = 'OPEN',
        open_until = now() + (p_open_timeout_seconds || ' seconds')::interval,
        updated_at = now()
    WHERE id = p_circuit_id;
  END IF;
END;
$$;

-- record_circuit_success: resets failure count, closes circuit
CREATE OR REPLACE FUNCTION public.record_circuit_success(
  p_circuit_id text DEFAULT 'website_outbound'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.sync_circuit_state (id, state, failure_count, updated_at)
  VALUES (p_circuit_id, 'CLOSED', 0, now())
  ON CONFLICT (id) DO UPDATE SET
    state = 'CLOSED',
    failure_count = 0,
    open_until = NULL,
    updated_at = now();
END;
$$;

-- reset_circuit_breaker: manual reset
CREATE OR REPLACE FUNCTION public.reset_circuit_breaker(
  p_circuit_id text DEFAULT 'website_outbound'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.sync_circuit_state (id, state, failure_count, updated_at)
  VALUES (p_circuit_id, 'CLOSED', 0, now())
  ON CONFLICT (id) DO UPDATE SET
    state = 'CLOSED',
    failure_count = 0,
    open_until = NULL,
    updated_at = now();
END;
$$;
