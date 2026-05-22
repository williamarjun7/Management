const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function (req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Auth is handled by InsForge gateway; no additional check needed.

  try {
    const body = await req.json();
    const { action, ...params } = body;

    if (action === 'generate_qr') return await handleGenerateQR(params, corsHeaders);
    if (action === 'verify') return await handleVerify(params, corsHeaders);

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function handleGenerateQR(params, corsHeaders) {
  const { amount, transaction_id, invoice_id } = params;
  const merchantCode = Deno.env.get('FONEPAY_MERCHANT_CODE');
  const secretKey = Deno.env.get('FONEPAY_SECRET_KEY');
  const callbackUrl = Deno.env.get('FONEPAY_CALLBACK_URL') || '';

  if (!merchantCode || !secretKey) {
    return new Response(JSON.stringify({ error: 'Fonepay not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!amount || !transaction_id) {
    return new Response(JSON.stringify({ error: 'amount and transaction_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const amt = parseFloat(amount).toFixed(2);
  const now = new Date();
  const dt = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');

  const pid = merchantCode;
  const md = 'D';
  const prn = transaction_id;
  const crn = 'NPR';
  const r1 = 'Highlands Cafe';
  const r2 = `INV:${invoice_id || 'POS'}`;
  const ru = callbackUrl;

  const dvInput = pid + md + prn + amt + crn + dt + r1 + r2 + ru;
  const dv = await hmacSha512Hex(secretKey, dvInput);

  const paymentUrl = `https://clientapi.fonepay.com/api/merchantRequest?PID=${encodeURIComponent(pid)}&MD=${encodeURIComponent(md)}&PRN=${encodeURIComponent(prn)}&AMT=${encodeURIComponent(amt)}&CRN=${encodeURIComponent(crn)}&DT=${encodeURIComponent(dt)}&R1=${encodeURIComponent(r1)}&R2=${encodeURIComponent(r2)}${ru ? `&RU=${encodeURIComponent(ru)}` : ''}&DV=${dv}`;

  return new Response(JSON.stringify({
    success: true,
    payment_url: paymentUrl,
    merchant_code: merchantCode,
    transaction_id,
    amount: amt,
    expires_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleVerify(params, corsHeaders) {
  const { transaction_id, amount } = params;
  const merchantCode = Deno.env.get('FONEPAY_MERCHANT_CODE');
  const secretKey = Deno.env.get('FONEPAY_SECRET_KEY');

  if (!merchantCode || !secretKey) {
    return new Response(JSON.stringify({ error: 'Fonepay not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const amt = parseFloat(amount).toFixed(2);
  const dvInput = merchantCode + transaction_id + amt;
  const dv = await hmacSha512Hex(secretKey, dvInput);

  try {
    const resp = await fetch('https://clientapi.fonepay.com/api/merchantRequest/verificationMerchant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        PID: merchantCode,
        PRN: transaction_id,
        AMT: amt,
        DV: dv,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ success: false, verified: false, error: text }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await resp.json();

    const verified = result?.status === 'verified' ||
      result?.success === true ||
      result?.response_code === 'success' ||
      false;

    return new Response(JSON.stringify({
      success: true,
      verified,
      raw: result,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, verified: false, error: err.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function hmacSha512Hex(key, data) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-512' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
