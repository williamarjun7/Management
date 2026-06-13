const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Signature, X-Idempotency-Key',
};

const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 60;
const ipRequests = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipRequests.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW;
  }
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

async function posQuery(url, params) {
  const { fnUrl, anonKey } = getPosApi();
  const queryStr = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const resp = await fetch(`${fnUrl}/api/database/records/${url}?${queryStr}`, {
    headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`POS query failed: ${text}`);
  }
  return resp.json();
}

async function logSync(direction, eventType, entityType, entityId, externalId, status, requestBody, responseBody, errorMessage, idempotencyKey) {
  try {
    await posRpc('log_sync_entry', {
      p_direction: direction,
      p_event_type: eventType,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_external_id: externalId,
      p_status: status,
      p_request_body: requestBody ? JSON.stringify(requestBody) : null,
      p_response_body: responseBody ? JSON.stringify(responseBody) : null,
      p_error_message: errorMessage,
      p_source: 'website',
      p_idempotency_key: idempotencyKey,
    });
  } catch (err) {
    console.error('log_sync_entry failed', err.message);
  }
}

async function checkAvailability(roomId, checkIn, checkOut, excludeBookingId) {
  const bookings = await posQuery('bookings', {
    select: 'id,guest_name,check_in,check_out,status',
    room_id: `eq.${roomId}`,
    status: `in.(confirmed,checked_in)`,
    order: 'check_in.asc',
  });
  const startDate = new Date(checkIn);
  const endDate = new Date(checkOut);
  const conflicts = bookings.filter(b => {
    if (excludeBookingId && b.id === excludeBookingId) return false;
    const bIn = new Date(b.check_in);
    const bOut = new Date(b.check_out);
    return startDate < bOut && endDate > bIn;
  });
  return conflicts;
}

export default async function (req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const webhookSecret = Deno.env.get('BOOKING_WEBHOOK_SECRET');
  if (webhookSecret) {
    const signature = req.headers.get('X-Webhook-Signature');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const bodyText = await req.text();
    const expectedSig = await hmacSha256Hex(webhookSecret, bodyText);
    if (signature !== expectedSig) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    req.body = () => Promise.resolve(bodyText);
  }

  try {
    const body = await req.json();
    const { event_type, external_booking_id, website_room_id, guest_name, guest_phone, guest_email, check_in, check_out, adults, children, nightly_rate, total_amount, notes } = body;

    if (!event_type || !external_booking_id) {
      return new Response(JSON.stringify({ error: 'event_type and external_booking_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const idempotencyKey = body.idempotency_key || `webhook:${external_booking_id}:${event_type}:${body.timestamp || Date.now()}`;

    const existingLogs = await posQuery('sync_logs', {
      select: 'id,status',
      idempotency_key: `eq.${idempotencyKey}`,
      limit: '1',
    });
    if (existingLogs.length > 0) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let result;
    let entityId = null;

    switch (event_type) {
      case 'booking.created': {
        if (!website_room_id || !guest_name || !check_in || !check_out) {
          return new Response(JSON.stringify({ error: 'Missing required fields for booking.created' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const mappings = await posQuery('room_mappings', {
          select: 'pos_room_id',
          website_room_id: `eq.${website_room_id}`,
          limit: '1',
        });
        if (mappings.length === 0) {
          await logSync('incoming', event_type, 'booking', null, external_booking_id, 'skipped', body, null, `No room mapping for website_room_id=${website_room_id}`, idempotencyKey);
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'No room mapping' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const posRoomId = mappings[0].pos_room_id;
        const conflicts = await checkAvailability(posRoomId, check_in, check_out, null);
        if (conflicts.length > 0) {
          await logSync('incoming', event_type, 'booking', null, external_booking_id, 'skipped', body, { conflicts }, `Room ${posRoomId} has conflicting bookings`, idempotencyKey);
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'Conflict', conflicts }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        result = await posRpc('create_booking', {
          p_room_id: posRoomId,
          p_guest_name: guest_name,
          p_guest_phone: guest_phone || null,
          p_guest_email: guest_email || null,
          p_check_in: check_in,
          p_check_out: check_out,
          p_adults: adults || 1,
          p_children: children || 0,
          p_nightly_rate: nightly_rate || 0,
          p_total_amount: total_amount || 0,
          p_notes: notes || null,
          p_created_by: null,
          p_idempotency_key: idempotencyKey,
        });
        entityId = result?.booking_id || null;
        if (entityId) {
          await posRpc('link_external_booking', {
            p_pos_booking_id: entityId,
            p_source: 'website',
            p_external_booking_id: external_booking_id,
          });
        }
        break;
      }

      case 'booking.updated': {
        const extBookings = await posQuery('external_bookings', {
          select: 'pos_booking_id',
          external_booking_id: `eq.${external_booking_id}`,
          source: `eq.website`,
          limit: '1',
        });
        if (extBookings.length === 0) {
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'No linked POS booking' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        entityId = extBookings[0].pos_booking_id;
        await posRpc('update_booking_dates', {
          p_booking_id: entityId,
          p_check_in: check_in || null,
          p_check_out: check_out || null,
          p_guest_name: guest_name || null,
          p_guest_phone: guest_phone || null,
          p_guest_email: guest_email || null,
          p_adults: adults || null,
          p_children: children || null,
          p_nightly_rate: nightly_rate || null,
          p_total_amount: total_amount || null,
          p_notes: notes || null,
          p_idempotency_key: idempotencyKey,
        });
        break;
      }

      case 'booking.cancelled': {
        const extBookings = await posQuery('external_bookings', {
          select: 'pos_booking_id',
          external_booking_id: `eq.${external_booking_id}`,
          source: `eq.website`,
          limit: '1',
        });
        if (extBookings.length === 0) {
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'No linked POS booking' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        entityId = extBookings[0].pos_booking_id;
        await posRpc('cancel_external_booking', {
          p_booking_id: entityId,
          p_reason: 'Cancelled via website sync',
          p_idempotency_key: idempotencyKey,
        });
        break;
      }

      case 'booking.checked_in': {
        const extBookings = await posQuery('external_bookings', {
          select: 'pos_booking_id',
          external_booking_id: `eq.${external_booking_id}`,
          source: `eq.website`,
          limit: '1',
        });
        if (extBookings.length === 0) {
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'No linked POS booking' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        entityId = extBookings[0].pos_booking_id;
        await posRpc('process_check_in', {
          p_booking_id: entityId,
          p_user_id: null,
          p_idempotency_key: idempotencyKey,
        });
        break;
      }

      case 'booking.checked_out': {
        const extBookings = await posQuery('external_bookings', {
          select: 'pos_booking_id',
          external_booking_id: `eq.${external_booking_id}`,
          source: `eq.website`,
          limit: '1',
        });
        if (extBookings.length === 0) {
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'No linked POS booking' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        entityId = extBookings[0].pos_booking_id;
        await posRpc('process_check_out', {
          p_booking_id: entityId,
          p_user_id: null,
          p_idempotency_key: idempotencyKey,
        });
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown event_type: ${event_type}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await logSync('incoming', event_type, 'booking', entityId, external_booking_id, 'success', body, result, null, idempotencyKey);

    return new Response(JSON.stringify({ received: true, entity_id: entityId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('booking-webhook error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
