const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key, X-Timestamp',
};

const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 30;
const ipRequests = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipRequests.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + RATE_LIMIT_WINDOW; }
  entry.count++;
  ipRequests.set(ip, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

async function hmacSha256Hex(key, data) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getPosApi() {
  const fnUrl = Deno.env.get('INSFORGE_FUNCTIONS_URL');
  const anonKey = Deno.env.get('ANON_KEY');
  if (!fnUrl || !anonKey) throw new Error('POS API not configured');
  return { fnUrl, anonKey };
}

async function posRpc(rpcName, params) {
  const { fnUrl, anonKey } = getPosApi();
  const resp = await fetch(`${fnUrl}/api/database/rpc/${rpcName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify(params),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${rpcName} failed: ${text}`);
  }
  return resp.json();
}

// ── Circuit breaker helpers ──

async function checkCircuitOpen() {
  try {
    const result = await posRpc('check_circuit_breaker', { p_circuit_id: 'website_outbound' });
    return result === true;
  } catch (err) {
    console.error('check_circuit_breaker failed, assuming closed', err.message);
    return false;
  }
}

async function recordCircuitFailure() {
  try {
    await posRpc('record_circuit_failure', {
      p_circuit_id: 'website_outbound',
      p_failure_threshold: 3,
      p_open_timeout_seconds: 60,
    });
  } catch (err) {
    console.error('record_circuit_failure failed', err.message);
  }
}

async function recordCircuitSuccess() {
  try {
    await posRpc('record_circuit_success', { p_circuit_id: 'website_outbound' });
  } catch (err) {
    console.error('record_circuit_success failed', err.message);
  }
}

// ── Logging helper (v2 with propagation fields) ──

async function logSync(direction, eventType, entityType, entityId, externalId, status, requestBody, responseBody, errorMessage, idempotencyKey, propagation) {
  try {
    await posRpc('log_sync_entry_v2', {
      p_direction: direction,
      p_event_type: eventType,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_external_id: externalId,
      p_status: status,
      p_request_body: requestBody ? JSON.stringify(requestBody) : null,
      p_response_body: responseBody ? JSON.stringify(responseBody) : null,
      p_error_message: errorMessage,
      p_source: 'pos',
      p_idempotency_key: idempotencyKey,
      p_origin_system: propagation?.origin_system || null,
      p_trace_id: propagation?.trace_id || null,
      p_parent_event_id: propagation?.parent_event_id || null,
    });
  } catch (err) {
    console.error('log_sync_entry_v2 failed', err.message);
  }
}

// ── Build signed payload for website webhook ──

function buildSignedPayload(basePayload, websiteUrl) {
  const timestamp = new Date().toISOString();
  const payload = {
    ...basePayload,
    source: 'pos',
    timestamp,
  };
  const bodyStr = JSON.stringify(payload);
  return { payload, bodyStr, timestamp };
}

async function sendSignedPost(websiteUrl, webhookSecret, bodyStr, idempotencyKey) {
  const webhookUrl = `${websiteUrl}/functions/booking-webhook`;
  const signature = webhookSecret ? await hmacSha256Hex(webhookSecret, bodyStr) : '';
  return fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'X-Webhook-Signature': signature } : {}),
      'X-Timestamp': new Date().toISOString(),
      'X-Idempotency-Key': idempotencyKey,
    },
    body: bodyStr,
  });
}

export default async function (req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const apiToken = Deno.env.get('WEBSITE_SYNC_API_TOKEN');
  const authHeader = req.headers.get('Authorization');
  if (apiToken && (!authHeader || authHeader !== `Bearer ${apiToken}`)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json();
    const { action, ...params } = body;

    const websiteUrl = Deno.env.get('WEBSITE_BASE_URL');
    const webhookSecret = Deno.env.get('BOOKING_WEBHOOK_SECRET');
    if (!websiteUrl) {
      return new Response(JSON.stringify({ error: 'Website URL not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Circuit breaker check ──
    const circuitOpen = await checkCircuitOpen();
    if (circuitOpen && (action === 'push_booking' || action === 'push_status_update')) {
      return new Response(JSON.stringify({ success: false, error: 'Circuit breaker open — outbound sync paused' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Propagation fields ──
    const propagation = {
      origin_system: params.propagation?.origin_system || 'pos',
      trace_id: params.propagation?.trace_id || `pos:${params.external_booking_id || 'unknown'}:${action}:${Date.now()}`,
      parent_event_id: params.propagation?.parent_event_id || null,
    };

    if (action === 'push_booking') {
      const { external_booking_id, website_room_id, guest_name, guest_phone, guest_email, check_in, check_out, adults, children, nightly_rate, total_amount, notes, idempotency_key } = params;

      if (!website_room_id || !guest_name || !check_in || !check_out || !idempotency_key) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { payload, bodyStr } = buildSignedPayload({
        event_type: 'booking.created',
        external_booking_id,
        website_room_id,
        guest_name,
        guest_phone,
        guest_email,
        check_in,
        check_out,
        adults,
        children,
        nightly_rate,
        total_amount,
        notes,
        idempotency_key,
        origin_system: propagation.origin_system,
        trace_id: propagation.trace_id,
        parent_event_id: propagation.parent_event_id,
      }, websiteUrl);

      const resp = await sendSignedPost(websiteUrl, webhookSecret, bodyStr, idempotency_key);

      if (!resp.ok) {
        const errText = await resp.text();
        // Record circuit failure on 5xx
        if (resp.status >= 500) {
          await recordCircuitFailure();
        }
        // Queue retry
        const { fnUrl, anonKey } = getPosApi();
        await posRpc('queue_sync_retry', {
          p_direction: 'outgoing',
          p_event_type: 'booking.created',
          p_payload: bodyStr,
          p_max_retries: 5,
          p_error: errText,
        });
        await logSync('outgoing', 'booking.created', 'booking', null, external_booking_id, 'failed', payload, null, errText, idempotency_key, propagation);
        return new Response(JSON.stringify({ success: false, error: errText }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const result = await resp.json();
      await recordCircuitSuccess();
      await logSync('outgoing', 'booking.created', 'booking', result?.entity_id || null, external_booking_id, 'success', payload, result, null, idempotency_key, propagation);
      return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'push_status_update') {
      const { external_booking_id, event_type, idempotency_key } = params;

      const { payload, bodyStr } = buildSignedPayload({
        event_type,
        external_booking_id,
        idempotency_key,
        origin_system: propagation.origin_system,
        trace_id: propagation.trace_id,
        parent_event_id: propagation.parent_event_id,
      }, websiteUrl);

      const resp = await sendSignedPost(websiteUrl, webhookSecret, bodyStr, idempotency_key);

      if (!resp.ok) {
        const errText = await resp.text();
        if (resp.status >= 500) {
          await recordCircuitFailure();
        }
        const { fnUrl, anonKey } = getPosApi();
        await posRpc('queue_sync_retry', {
          p_direction: 'outgoing',
          p_event_type: event_type,
          p_payload: bodyStr,
          p_max_retries: 5,
          p_error: errText,
        });
        await logSync('outgoing', event_type, 'booking', null, external_booking_id, 'failed', payload, null, errText, idempotency_key, propagation);
        return new Response(JSON.stringify({ success: false, error: errText }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const result = await resp.json();
      await recordCircuitSuccess();
      await logSync('outgoing', event_type, 'booking', result?.entity_id || null, external_booking_id, 'success', payload, result, null, idempotency_key, propagation);
      return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'check_availability') {
      const { pos_room_id, check_in, check_out } = params;
      const { fnUrl, anonKey } = getPosApi();

      const bookings = await (async () => {
        const resp = await fetch(`${fnUrl}/api/database/records/bookings?select=id,guest_name,check_in,check_out,status&room_id=eq.${pos_room_id}&status=in.(confirmed,checked_in)&order=check_in.asc`, {
          headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
        });
        if (!resp.ok) return [];
        return resp.json();
      })();

      const inDate = new Date(check_in);
      const outDate = new Date(check_out);
      const conflicting = bookings.filter(b => {
        const bIn = new Date(b.check_in);
        const bOut = new Date(b.check_out);
        return inDate < bOut && outDate > bIn;
      });

      return new Response(JSON.stringify({
        success: true,
        available: conflicting.length === 0,
        conflicting_bookings: conflicting,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'retry_queue') {
      const { fnUrl, anonKey } = getPosApi();

      const queuedItems = await (async () => {
        const resp = await fetch(`${fnUrl}/api/database/records/sync_queue?select=*&status=eq.queued&next_retry_at=lte.now()&order=created_at.asc&limit=10`, {
          headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
        });
        if (!resp.ok) return [];
        return resp.json();
      })();

      // Ensure circuit allows retries
      const circuitOpen = await checkCircuitOpen();
      if (circuitOpen) {
        return new Response(JSON.stringify({ success: true, processed: 0, results: [], skipped: true, reason: 'Circuit breaker open' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const results = [];
      for (const item of queuedItems) {
        try {
          await posRpc('mark_queue_processing', { p_queue_id: item.id });

          let payloadObj = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
          const idempotencyKey = payloadObj.idempotency_key;

          const { bodyStr } = buildSignedPayload(payloadObj, websiteUrl);
          const resp = await sendSignedPost(websiteUrl, webhookSecret, bodyStr, idempotencyKey);

          if (resp.ok) {
            await posRpc('mark_queue_completed', { p_queue_id: item.id });
            results.push({ id: item.id, status: 'completed' });
          } else {
            const errText = await resp.text();
            if (resp.status >= 500) {
              await recordCircuitFailure();
            }
            await posRpc('mark_queue_retry', { p_queue_id: item.id, p_error: errText });
            results.push({ id: item.id, status: 'retried', error: errText });
          }
        } catch (err) {
          await posRpc('mark_queue_retry', { p_queue_id: item.id, p_error: err.message });
          results.push({ id: item.id, status: 'failed', error: err.message });
        }
      }

      return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
