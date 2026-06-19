const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Signature, X-Idempotency-Key, X-Timestamp',
};

const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 60;
const ipRequests = new Map();

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

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

async function sha256Hex(data) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
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

// ── Idempotency three-phase helpers ──

async function reserveIdempotencyKey(idempotencyKey) {
  const keyHash = await sha256Hex(idempotencyKey);
  return posRpc('reserve_idempotency_key', {
    p_key_hash: keyHash,
    p_idempotency_key: idempotencyKey,
  });
}

async function completeIdempotencyKey(idempotencyKey, response, statusCode) {
  const keyHash = await sha256Hex(idempotencyKey);
  await posRpc('complete_idempotency_key', {
    p_key_hash: keyHash,
    p_response: response ? JSON.stringify(response) : null,
    p_status_code: statusCode || 200,
  });
}

async function failIdempotencyKey(idempotencyKey, error) {
  const keyHash = await sha256Hex(idempotencyKey);
  await posRpc('fail_idempotency_key', {
    p_key_hash: keyHash,
    p_error: error,
  });
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
      p_source: 'website',
      p_idempotency_key: idempotencyKey,
      p_origin_system: propagation?.origin_system || null,
      p_trace_id: propagation?.trace_id || null,
      p_parent_event_id: propagation?.parent_event_id || null,
    });
  } catch (err) {
    console.error('log_sync_entry_v2 failed', err.message);
  }
}

// ── HMAC + Timestamp validation ──

async function verifyHmacWithTimestamp(webhookSecret, bodyText, signature, timestampHeader) {
  if (!timestampHeader) {
    return { valid: false, reason: 'Missing X-Timestamp header' };
  }
  const eventTime = new Date(timestampHeader).getTime();
  if (isNaN(eventTime)) {
    return { valid: false, reason: 'Invalid X-Timestamp format' };
  }
  if (Math.abs(Date.now() - eventTime) > TIMESTAMP_TOLERANCE_MS) {
    return { valid: false, reason: 'Timestamp outside ±5 minute window' };
  }
  const expectedSig = await hmacSha256Hex(webhookSecret, bodyText);
  if (signature !== expectedSig) {
    return { valid: false, reason: 'HMAC signature mismatch' };
  }
  return { valid: true };
}

// ── Availability check (atomic, no writes yet) ──

async function checkAvailability(roomId, checkIn, checkOut, excludeBookingId) {
  const bookings = await posQuery('bookings', {
    select: 'id,guest_name,check_in,check_out,status',
    room_id: `eq.${roomId}`,
    status: `in.(confirmed,checked_in)`,
    order: 'check_in.asc',
  });
  const startDate = new Date(checkIn);
  const endDate = new Date(checkOut);
  return bookings.filter(b => {
    if (excludeBookingId && b.id === excludeBookingId) return false;
    const bIn = new Date(b.check_in);
    const bOut = new Date(b.check_out);
    return startDate < bOut && endDate > bIn;
  });
}

export default async function (req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const webhookSecret = Deno.env.get('BOOKING_WEBHOOK_SECRET');

  let bodyText;
  let body;
  let idempotencyKey;
  let propagation;

  try {
    bodyText = await req.text();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // HMAC + Timestamp validation (if secret configured)
  if (webhookSecret) {
    const signature = req.headers.get('X-Webhook-Signature');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing X-Webhook-Signature' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const timestamp = req.headers.get('X-Timestamp');
    const verification = await verifyHmacWithTimestamp(webhookSecret, bodyText, signature, timestamp);
    if (!verification.valid) {
      return new Response(JSON.stringify({ error: verification.reason }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  try {
    body = JSON.parse(bodyText);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { event_type, external_booking_id, website_room_id, guest_name, guest_phone, guest_email, check_in, check_out, adults, children, nightly_rate, total_amount, notes, source, origin_system } = body;

  if (!event_type || !external_booking_id) {
    return new Response(JSON.stringify({ error: 'event_type and external_booking_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const rawIdempotencyKey = body.idempotency_key;
  if (!rawIdempotencyKey) {
    return new Response(JSON.stringify({ error: 'idempotency_key is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── Loop Prevention ──
  // POS must never process events it originated.
  // The website-sync edge function sends events with source='pos'.
  // If we see source='pos' or origin_system='pos', reject immediately.
  if (source === 'pos' || origin_system === 'pos') {
    console.warn('loop_prevention: rejected event', { event_type, external_booking_id, source, origin_system });
    return new Response(JSON.stringify({ received: true, skipped: true, reason: 'Self-originated event rejected (loop prevention)' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // ── Propagation fields ──
  propagation = {
    origin_system: body.origin_system || 'website',
    trace_id: body.trace_id || `webhook:${external_booking_id}:${event_type}:${Date.now()}`,
    parent_event_id: body.parent_event_id || null,
  };

  // ── Idempotency Key (guaranteed non-null by pre-check above) ──
  idempotencyKey = rawIdempotencyKey;

  // ── Phase 1: Reserve idempotency key ──
  let reserveResult;
  try {
    reserveResult = await reserveIdempotencyKey(idempotencyKey);
  } catch (err) {
    console.error('idempotency_reserve_failed', err.message);
    return new Response(JSON.stringify({ error: 'Failed to acquire idempotency lock' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (reserveResult.action === 'replay') {
    const cachedResponse = reserveResult.response || {};
    return new Response(JSON.stringify({ received: true, duplicate: true, ...cachedResponse }), {
      status: reserveResult.status_code || 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (reserveResult.action === 'conflict') {
    return new Response(JSON.stringify({ error: 'Concurrent request in flight for same idempotency key' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Phase 2: Execute ──
  let result;
  let entityId = null;
  let responsePayload;

  try {
    switch (event_type) {
      case 'booking.created': {
        if (!website_room_id || !guest_name || !check_in || !check_out) {
          await failIdempotencyKey(idempotencyKey, 'Missing required fields for booking.created');
          await logSync('incoming', event_type, 'booking', null, external_booking_id, 'skipped', body, null, 'Missing required fields', idempotencyKey, propagation);
          return new Response(JSON.stringify({ error: 'Missing required fields for booking.created' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const mappings = await posQuery('room_mappings', {
          select: 'pos_room_id',
          website_room_id: `eq.${website_room_id}`,
          limit: '1',
        });
        if (mappings.length === 0) {
          await completeIdempotencyKey(idempotencyKey, { skipped: true, reason: 'No room mapping' }, 200);
          await logSync('incoming', event_type, 'booking', null, external_booking_id, 'skipped', body, null, `No room mapping for website_room_id=${website_room_id}`, idempotencyKey, propagation);
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'No room mapping' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const posRoomId = mappings[0].pos_room_id;

        // Atomic conflict check — before any mutation
        const conflicts = await checkAvailability(posRoomId, check_in, check_out, null);
        if (conflicts.length > 0) {
          await completeIdempotencyKey(idempotencyKey, { skipped: true, reason: 'Conflict', conflicts }, 409);
          await logSync('incoming', event_type, 'booking', null, external_booking_id, 'skipped', body, { conflicts }, `Room ${posRoomId} has conflicting bookings`, idempotencyKey, propagation);
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
          await posRpc('external_bookings_upsert', {
            p_pos_booking_id: entityId,
            p_source: 'website',
            p_external_booking_id: external_booking_id,
            p_sync_status: 'synced',
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
          await completeIdempotencyKey(idempotencyKey, { skipped: true, reason: 'No linked POS booking' }, 200);
          await logSync('incoming', event_type, 'booking', null, external_booking_id, 'skipped', body, null, 'No linked POS booking', idempotencyKey, propagation);
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'No linked POS booking' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        entityId = extBookings[0].pos_booking_id;

        // Availability check if dates are being changed
        if (check_in || check_out) {
          const bookingDetails = await posQuery('bookings', {
            select: 'room_id,check_in,check_out',
            id: `eq.${entityId}`,
            limit: '1',
          });
          if (bookingDetails.length > 0) {
            const effectiveCheckIn = check_in || bookingDetails[0].check_in;
            const effectiveCheckOut = check_out || bookingDetails[0].check_out;
            const conflicts = await checkAvailability(bookingDetails[0].room_id, effectiveCheckIn, effectiveCheckOut, entityId);
            if (conflicts.length > 0) {
              await completeIdempotencyKey(idempotencyKey, { skipped: true, reason: 'Date conflict', conflicts }, 409);
              return new Response(JSON.stringify({ received: true, skipped: true, reason: 'Date conflict', conflicts }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          }
        }

        result = await posRpc('update_booking_dates', {
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
          await completeIdempotencyKey(idempotencyKey, { skipped: true, reason: 'No linked POS booking' }, 200);
          await logSync('incoming', event_type, 'booking', null, external_booking_id, 'skipped', body, null, 'No linked POS booking', idempotencyKey, propagation);
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'No linked POS booking' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        entityId = extBookings[0].pos_booking_id;
        result = await posRpc('cancel_external_booking', {
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
          await completeIdempotencyKey(idempotencyKey, { skipped: true, reason: 'No linked POS booking' }, 200);
          await logSync('incoming', event_type, 'booking', null, external_booking_id, 'skipped', body, null, 'No linked POS booking', idempotencyKey, propagation);
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'No linked POS booking' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        entityId = extBookings[0].pos_booking_id;
        result = await posRpc('process_check_in', {
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
          await completeIdempotencyKey(idempotencyKey, { skipped: true, reason: 'No linked POS booking' }, 200);
          await logSync('incoming', event_type, 'booking', null, external_booking_id, 'skipped', body, null, 'No linked POS booking', idempotencyKey, propagation);
          return new Response(JSON.stringify({ received: true, skipped: true, reason: 'No linked POS booking' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        entityId = extBookings[0].pos_booking_id;
        result = await posRpc('process_check_out', {
          p_booking_id: entityId,
          p_user_id: null,
          p_idempotency_key: idempotencyKey,
        });
        break;
      }

      default:
        await failIdempotencyKey(idempotencyKey, `Unknown event_type: ${event_type}`);
        await logSync('incoming', event_type, 'booking', null, external_booking_id, 'skipped', body, null, `Unknown event_type`, idempotencyKey, propagation);
        return new Response(JSON.stringify({ error: `Unknown event_type: ${event_type}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Phase 3: Complete idempotency key ──
    responsePayload = { received: true, entity_id: entityId };
    await completeIdempotencyKey(idempotencyKey, responsePayload, 200);

    await logSync('incoming', event_type, 'booking', entityId, external_booking_id, 'success', body, result, null, idempotencyKey, propagation);

    return new Response(JSON.stringify(responsePayload), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('booking-webhook error:', err.message);
    // Mark idempotency as failed so it can be retried with a new key
    try {
      await failIdempotencyKey(idempotencyKey, err.message);
    } catch (idempErr) {
      console.error('failed to mark idempotency as failed', idempErr.message);
    }
    await logSync('incoming', event_type, 'booking', entityId, external_booking_id, 'failed', body, null, err.message, idempotencyKey, propagation);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
