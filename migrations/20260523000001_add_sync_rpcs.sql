-- ============================================================
-- MIGRATION: Add sync RPC functions for booking-webhook
-- ============================================================
-- These functions are called by the booking-webhook edge function
-- when receiving sync events from the website. They manage sync
-- logging, retry queue, external booking linking, and booking
-- status transitions (check-in, check-out, cancel, update dates).
-- ============================================================

-- Add check-in/out timestamp columns to bookings (if missing)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_out_at timestamptz;

-- ============================================================
-- 1. log_sync_entry — record a sync event in sync_logs
-- ============================================================
CREATE OR REPLACE FUNCTION log_sync_entry(
  p_direction text,
  p_event_type text,
  p_entity_type text DEFAULT 'booking',
  p_entity_id text DEFAULT NULL,
  p_external_id text DEFAULT NULL,
  p_status text DEFAULT 'pending',
  p_request_body jsonb DEFAULT NULL,
  p_response_body jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_source text DEFAULT 'website',
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.sync_logs (
    direction, event_type, entity_type, entity_id, external_id,
    status, request_body, response_body, error_message,
    source, idempotency_key
  ) VALUES (
    p_direction, p_event_type, p_entity_type, p_entity_id, p_external_id,
    p_status, p_request_body, p_response_body, p_error_message,
    p_source, p_idempotency_key
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'logged', 'sync_log_id', v_id);
END;
$$;

-- ============================================================
-- 2. queue_sync_retry — add item to retry queue
-- ============================================================
CREATE OR REPLACE FUNCTION queue_sync_retry(
  p_direction text,
  p_event_type text,
  p_payload jsonb,
  p_max_retries int DEFAULT 5,
  p_error text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.sync_queue (
    direction, event_type, payload, max_retries, last_error, status
  ) VALUES (
    p_direction, p_event_type, p_payload, p_max_retries, p_error, 'queued'
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'queued', 'queue_id', v_id);
END;
$$;

-- ============================================================
-- 3. mark_queue_processing — mark queue item as processing
-- ============================================================
CREATE OR REPLACE FUNCTION mark_queue_processing(
  p_queue_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.sync_queue
  SET status = 'processing', updated_at = now()
  WHERE id = p_queue_id AND status = 'queued';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found_or_already_processing');
  END IF;

  RETURN jsonb_build_object('status', 'processing', 'queue_id', p_queue_id);
END;
$$;

-- ============================================================
-- 4. mark_queue_completed — mark queue item as completed
-- ============================================================
CREATE OR REPLACE FUNCTION mark_queue_completed(
  p_queue_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  UPDATE public.sync_queue
  SET status = 'completed', updated_at = now()
  WHERE id = p_queue_id;

  RETURN jsonb_build_object('status', 'completed', 'queue_id', p_queue_id);
END;
$$;

-- ============================================================
-- 5. mark_queue_retry — increment retry or mark as failed
-- ============================================================
CREATE OR REPLACE FUNCTION mark_queue_retry(
  p_queue_id uuid,
  p_error text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_item public.sync_queue;
  v_new_status text;
  v_next_retry_seconds int;
BEGIN
  SELECT * INTO v_item FROM public.sync_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_item.retry_count >= v_item.max_retries THEN
    v_new_status := 'failed';
    v_next_retry_seconds := 0;
  ELSE
    v_new_status := 'queued';
    v_next_retry_seconds := LEAST(30, POWER(2, v_item.retry_count))::int;
  END IF;

  UPDATE public.sync_queue
  SET
    status = v_new_status,
    retry_count = retry_count + 1,
    next_retry_at = CASE WHEN v_new_status = 'queued' THEN now() + (v_next_retry_seconds || ' seconds')::interval ELSE next_retry_at END,
    last_error = COALESCE(p_error, last_error),
    updated_at = now()
  WHERE id = p_queue_id;

  RETURN jsonb_build_object(
    'status', v_new_status,
    'queue_id', p_queue_id,
    'retry_count', v_item.retry_count + 1,
    'max_retries', v_item.max_retries
  );
END;
$$;

-- ============================================================
-- 6. link_external_booking — map POS booking to external booking
-- ============================================================
CREATE OR REPLACE FUNCTION link_external_booking(
  p_pos_booking_id uuid,
  p_source text,
  p_external_booking_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.external_bookings (pos_booking_id, source, external_booking_id)
  VALUES (p_pos_booking_id, p_source, p_external_booking_id)
  ON CONFLICT (source, external_booking_id) DO UPDATE
    SET pos_booking_id = p_pos_booking_id, last_sync_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'linked', 'external_booking_id', v_id);
END;
$$;

-- ============================================================
-- 7. cancel_external_booking — cancel booking via sync
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_external_booking(
  p_booking_id uuid,
  p_reason text DEFAULT 'Cancelled via website sync',
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_booking public.bookings;
  v_room_id uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    IF (SELECT check_idempotency_strict(p_idempotency_key, 'cancel_external_booking')) IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'already_cancelled', 'booking_id', p_booking_id);
    END IF;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'booking_not_found');
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'already_cancelled', 'booking_id', p_booking_id);
  END IF;

  v_room_id := v_booking.room_id;

  UPDATE public.bookings SET status = 'cancelled', updated_at = now() WHERE id = p_booking_id;

  UPDATE public.rooms SET status = 'available', updated_at = now() WHERE id = v_room_id;

  INSERT INTO public.room_state_transitions (room_id, from_status, to_status, reason)
  VALUES (v_room_id, v_booking.status, 'available', 'booking_cancelled_via_sync');

  PERFORM public.create_system_event('BOOKING_CANCELLED', 'booking', p_booking_id::text,
    jsonb_build_object('booking_id', p_booking_id, 'room_id', v_room_id, 'reason', p_reason));

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'cancel_external_booking',
      jsonb_build_object('booking_id', p_booking_id, 'room_id', v_room_id));
  END IF;

  RETURN jsonb_build_object('status', 'cancelled', 'booking_id', p_booking_id, 'room_id', v_room_id);
END;
$$;

-- ============================================================
-- 8. update_booking_dates — update booking details from sync
-- ============================================================
CREATE OR REPLACE FUNCTION update_booking_dates(
  p_booking_id uuid,
  p_check_in timestamptz DEFAULT NULL,
  p_check_out timestamptz DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_guest_phone text DEFAULT NULL,
  p_guest_email text DEFAULT NULL,
  p_adults int DEFAULT NULL,
  p_children int DEFAULT NULL,
  p_nightly_rate decimal(10,2) DEFAULT NULL,
  p_total_amount decimal(10,2) DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    IF (SELECT check_idempotency_strict(p_idempotency_key, 'update_booking_dates')) IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'already_updated', 'booking_id', p_booking_id);
    END IF;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'booking_not_found');
  END IF;

  UPDATE public.bookings SET
    check_in = COALESCE(p_check_in, check_in),
    check_out = COALESCE(p_check_out, check_out),
    guest_name = COALESCE(p_guest_name, guest_name),
    guest_phone = COALESCE(p_guest_phone, guest_phone),
    guest_email = COALESCE(p_guest_email, guest_email),
    adults = COALESCE(p_adults, adults),
    children = COALESCE(p_children, children),
    nightly_rate = COALESCE(p_nightly_rate, nightly_rate),
    total_amount = COALESCE(p_total_amount, total_amount),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_booking_id;

  PERFORM public.create_system_event('BOOKING_UPDATED', 'booking', p_booking_id::text,
    jsonb_build_object('booking_id', p_booking_id));

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'update_booking_dates',
      jsonb_build_object('booking_id', p_booking_id));
  END IF;

  RETURN jsonb_build_object('status', 'updated', 'booking_id', p_booking_id);
END;
$$;

-- ============================================================
-- 9. process_check_in — check in booking from sync
-- ============================================================
CREATE OR REPLACE FUNCTION process_check_in(
  p_booking_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    IF (SELECT check_idempotency_strict(p_idempotency_key, 'process_check_in')) IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'already_checked_in', 'booking_id', p_booking_id);
    END IF;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'booking_not_found');
  END IF;

  IF v_booking.status = 'checked_in' THEN
    RETURN jsonb_build_object('status', 'already_checked_in', 'booking_id', p_booking_id);
  END IF;

  IF v_booking.status NOT IN ('confirmed', 'pending') THEN
    RETURN jsonb_build_object('error', 'invalid_status', 'current', v_booking.status);
  END IF;

  UPDATE public.bookings SET status = 'checked_in', checked_in_at = now(), updated_at = now()
  WHERE id = p_booking_id;

  UPDATE public.rooms SET status = 'occupied', updated_at = now()
  WHERE id = v_booking.room_id;

  INSERT INTO public.room_state_transitions (room_id, from_status, to_status, reason, changed_by)
  VALUES (v_booking.room_id, 'reserved', 'occupied', 'check_in_via_sync', p_user_id);

  PERFORM public.create_system_event('BOOKING_CHECKED_IN', 'booking', p_booking_id::text,
    jsonb_build_object('booking_id', p_booking_id, 'room_id', v_booking.room_id));

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'process_check_in',
      jsonb_build_object('booking_id', p_booking_id));
  END IF;

  RETURN jsonb_build_object('status', 'checked_in', 'booking_id', p_booking_id, 'room_id', v_booking.room_id);
END;
$$;

-- ============================================================
-- 10. process_check_out — check out booking from sync
-- ============================================================
CREATE OR REPLACE FUNCTION process_check_out(
  p_booking_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    IF (SELECT check_idempotency_strict(p_idempotency_key, 'process_check_out')) IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'already_checked_out', 'booking_id', p_booking_id);
    END IF;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'booking_not_found');
  END IF;

  IF v_booking.status = 'checked_out' THEN
    RETURN jsonb_build_object('status', 'already_checked_out', 'booking_id', p_booking_id);
  END IF;

  IF v_booking.status NOT IN ('checked_in', 'confirmed') THEN
    RETURN jsonb_build_object('error', 'invalid_status', 'current', v_booking.status);
  END IF;

  UPDATE public.bookings SET status = 'checked_out', checked_out_at = now(), updated_at = now()
  WHERE id = p_booking_id;

  UPDATE public.rooms SET status = 'cleaning', updated_at = now()
  WHERE id = v_booking.room_id;

  INSERT INTO public.room_state_transitions (room_id, from_status, to_status, reason, changed_by)
  VALUES (v_booking.room_id, 'occupied', 'cleaning', 'check_out_via_sync', p_user_id);

  PERFORM public.create_system_event('BOOKING_CHECKED_OUT', 'booking', p_booking_id::text,
    jsonb_build_object('booking_id', p_booking_id, 'room_id', v_booking.room_id));

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'process_check_out',
      jsonb_build_object('booking_id', p_booking_id));
  END IF;

  RETURN jsonb_build_object('status', 'checked_out', 'booking_id', p_booking_id, 'room_id', v_booking.room_id);
END;
$$;

-- ============================================================
-- RLS policies for sync tables
-- ============================================================
ALTER TABLE IF EXISTS public.room_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.external_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "authenticated_all" ON public.room_mappings
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "authenticated_all" ON public.sync_logs
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "authenticated_all" ON public.sync_queue
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "authenticated_all" ON public.external_bookings
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
