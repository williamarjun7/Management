param()

$ErrorActionPreference = "Stop"
$apiKey = "ik_dd35cda33f481a1805481b09ea92b0ca"
$baseUrl = "https://8cvkfu8m.us-east.insforge.app"
$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Content-Type"  = "application/json"
    "apikey"        = $apiKey
}

function ExecSql($sql) {
    $body = @{ query = $sql } | ConvertTo-Json
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/query" -Method Post -Headers $headers -Body $body -ContentType "application/json"
        $count = if ($response.rowCount) { $response.rowCount } else { "done" }; Write-Output "OK: $count"
    } catch {
        Write-Output "ERROR: $($_.Exception.Message)"
        exit 1
    }
}

# Step 1: ALTER FUNCTION statements
ExecSql "ALTER FUNCTION public.confirm_order(uuid, uuid, text) SECURITY DEFINER;"
ExecSql "ALTER FUNCTION public.process_payment(uuid, numeric, payment_method, uuid, text, text, text) SECURITY DEFINER;"
ExecSql "ALTER FUNCTION public.process_check_in(uuid, uuid, text) SECURITY DEFINER;"
ExecSql "ALTER FUNCTION public.process_check_out(uuid, uuid, text) SECURITY DEFINER;"

# Step 2: CREATE OR REPLACE functions
ExecSql @"
CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_previous_state jsonb DEFAULT NULL,
  p_new_state jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, previous_state, new_state, reason)
  VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_previous_state, p_new_state, p_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
"@

ExecSql @"
CREATE OR REPLACE FUNCTION public.create_system_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_seq bigint;
BEGIN
  INSERT INTO system_events (event_type, entity_type, entity_id, payload)
  VALUES (p_event_type, p_entity_type, p_entity_id, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id, sequence_id INTO v_id, v_seq;

  PERFORM pg_notify('system_events',
    jsonb_build_object(
      'id', v_id,
      'sequence_id', v_seq,
      'event_type', p_event_type,
      'entity_type', p_entity_type,
      'entity_id', p_entity_id,
      'payload', COALESCE(p_payload, '{}'::jsonb)
    )::text);

  RETURN v_id;
END;
$$;
"@

# Step 3: RLS policies
ExecSql 'DROP POLICY IF EXISTS "Authenticated can insert audit_logs" ON audit_logs;'
ExecSql 'CREATE POLICY "Authenticated can insert audit_logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);'
ExecSql 'DROP POLICY IF EXISTS "Authenticated can insert system_events" ON system_events;'
ExecSql 'CREATE POLICY "Authenticated can insert system_events" ON system_events FOR INSERT TO authenticated WITH CHECK (true);'

# Step 4: write_frontend_audit function
ExecSql @"
CREATE OR REPLACE FUNCTION public.write_frontend_audit(
  p_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_previous_state jsonb DEFAULT NULL,
  p_new_state jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit_id uuid;
  v_event_id uuid;
BEGIN
  v_audit_id := create_audit_log(p_user_id, p_action, p_entity_type, p_entity_id, p_previous_state, p_new_state, p_reason);

  IF p_event_type IS NOT NULL THEN
    v_event_id := create_system_event(p_event_type, p_entity_type, p_entity_id,
      jsonb_build_object(
        'audit_id', v_audit_id,
        'action', p_action,
        'user_id', p_user_id,
        'reason', p_reason,
        'metadata', p_metadata
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'audit_id', v_audit_id,
    'event_id', v_event_id
  );
END;
$$;
"@

# Step 5: Indexes
ExecSql "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_action ON audit_logs(created_at DESC, action);"
ExecSql "CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);"
ExecSql "CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);"
ExecSql "CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);"

Write-Output "Migration steps 1-5 completed successfully."

# Step 6: Remove sequence_id references from system_events
ExecSql "DROP INDEX IF EXISTS idx_system_events_type_sequence;"

ExecSql @"
CREATE OR REPLACE FUNCTION public.create_system_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO system_events (event_type, entity_type, entity_id, payload)
  VALUES (p_event_type, p_entity_type, p_entity_id, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;

  PERFORM pg_notify('system_events',
    jsonb_build_object(
      'id', v_id,
      'event_type', p_event_type,
      'entity_type', p_entity_type,
      'entity_id', p_entity_id,
      'payload', COALESCE(p_payload, '{}'::jsonb)
    )::text);

  RETURN v_id;
END;
$$;
"@

ExecSql "NOTIFY pgrst, 'reload schema';"

Write-Output "Migration completed successfully."
