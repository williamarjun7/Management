const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

async function posRpc(fnUrl, anonKey, rpcName, params) {
  const resp = await fetch(`${fnUrl}/rest/v1/rpc/${rpcName}`, {
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
    const websiteApiKey = Deno.env.get('WEBSITE_API_KEY');
    if (!websiteUrl) {
      return new Response(JSON.stringify({ error: 'Website URL not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const websiteAuthHeaders = websiteApiKey ? { 'X-POS-API-Key': websiteApiKey } : {};

    if (action === 'push_booking') {
      const { external_booking_id, website_room_id, guest_name, guest_phone, guest_email, check_in, check_out, adults, children, nightly_rate, total_amount, notes, idempotency_key } = params;

      if (!website_room_id || !guest_name || !check_in || !check_out || !idempotency_key) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const eventPayload = JSON.stringify({
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
        source: 'pos',
        idempotency_key,
        timestamp: new Date().toISOString(),
      });

      const webhookSecret = Deno.env.get('BOOKING_WEBHOOK_SECRET');
      const signature = webhookSecret ? await hmacSha256Hex(webhookSecret, eventPayload) : '';

      const webhookUrl = `${websiteUrl}/functions/booking-webhook`;

      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...websiteAuthHeaders,
          ...(signature ? { 'X-Webhook-Signature': signature } : {}),
          'X-Idempotency-Key': idempotency_key,
        },
        body: eventPayload,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        const { fnUrl, anonKey } = (() => {
          const u = Deno.env.get('INSFORGE_FUNCTIONS_URL');
          const k = Deno.env.get('ANON_KEY');
          return { fnUrl: u, anonKey: k };
        })();
        if (fnUrl && anonKey) {
          await posRpc(fnUrl, anonKey, 'queue_sync_retry', {
            p_direction: 'outgoing',
            p_event_type: 'booking.created',
            p_payload: eventPayload,
            p_max_retries: 5,
            p_error: errText,
          });
        }

        return new Response(JSON.stringify({ success: false, error: errText }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const result = await resp.json();
      return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'push_status_update') {
      const { external_booking_id, event_type, idempotency_key } = params;

      const eventPayload = JSON.stringify({
        event_type,
        external_booking_id,
        source: 'pos',
        idempotency_key,
        timestamp: new Date().toISOString(),
      });

      const webhookSecret = Deno.env.get('BOOKING_WEBHOOK_SECRET');
      const signature = webhookSecret ? await hmacSha256Hex(webhookSecret, eventPayload) : '';

      const webhookUrl = `${websiteUrl}/functions/booking-webhook`;

      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...websiteAuthHeaders,
          ...(signature ? { 'X-Webhook-Signature': signature } : {}),
          'X-Idempotency-Key': idempotency_key,
        },
        body: eventPayload,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        const { fnUrl, anonKey } = (() => {
          const u = Deno.env.get('INSFORGE_FUNCTIONS_URL');
          const k = Deno.env.get('ANON_KEY');
          return { fnUrl: u, anonKey: k };
        })();
        if (fnUrl && anonKey) {
          await posRpc(fnUrl, anonKey, 'queue_sync_retry', {
            p_direction: 'outgoing',
            p_event_type: event_type,
            p_payload: eventPayload,
            p_max_retries: 5,
            p_error: errText,
          });
        }
        return new Response(JSON.stringify({ success: false, error: errText }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const result = await resp.json();
      return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'check_availability') {
      const { pos_room_id, check_in, check_out } = params;

      const { fnUrl, anonKey } = (() => {
        const u = Deno.env.get('INSFORGE_FUNCTIONS_URL');
        const k = Deno.env.get('ANON_KEY');
        return { fnUrl: u, anonKey: k };
      })();

      const bookings = await (async () => {
        const resp = await fetch(`${fnUrl}/rest/v1/bookings?select=id,guest_name,check_in,check_out,status&room_id=eq.${pos_room_id}&status=in.(confirmed,checked_in)&order=check_in.asc`, {
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
      const { fnUrl, anonKey } = (() => {
        const u = Deno.env.get('INSFORGE_FUNCTIONS_URL');
        const k = Deno.env.get('ANON_KEY');
        return { fnUrl: u, anonKey: k };
      })();

      const queuedItems = await (async () => {
        const resp = await fetch(`${fnUrl}/rest/v1/sync_queue?select=*&status=eq.queued&next_retry_at=lte.now()&order=created_at.asc&limit=10`, {
          headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
        });
        if (!resp.ok) return [];
        return resp.json();
      })();

      const results = [];
      for (const item of queuedItems) {
        try {
          await posRpc(fnUrl, anonKey, 'mark_queue_processing', { p_queue_id: item.id });

          const eventPayload = typeof item.payload === 'string' ? item.payload : JSON.stringify(item.payload);
      const webhookUrl = `${websiteUrl}/functions/booking-webhook`;
          const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...websiteAuthHeaders,
            },
            body: eventPayload,
          });

          if (resp.ok) {
            await posRpc(fnUrl, anonKey, 'mark_queue_completed', { p_queue_id: item.id });
            results.push({ id: item.id, status: 'completed' });
          } else {
            const errText = await resp.text();
            await posRpc(fnUrl, anonKey, 'mark_queue_retry', { p_queue_id: item.id, p_error: errText });
            results.push({ id: item.id, status: 'retried', error: errText });
          }
        } catch (err) {
          await posRpc(fnUrl, anonKey, 'mark_queue_retry', { p_queue_id: item.id, p_error: err.message });
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
