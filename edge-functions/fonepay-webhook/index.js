const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const FONEPAY_API = 'https://clientapi.fonepay.com/api/merchantRequest/verificationMerchant';

export default async function (req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const secret = Deno.env.get('FONEPAY_WEBHOOK_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (secret && (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== secret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { PID, PRN, AMT, DV, status: fpStatus, response_code, response_message } = body;

    const merchantCode = Deno.env.get('FONEPAY_MERCHANT_CODE');
    const secretKey = Deno.env.get('FONEPAY_SECRET_KEY');
    const anonKey = Deno.env.get('ANON_KEY');

    if (!merchantCode || !secretKey || !anonKey) {
      return new Response(JSON.stringify({ error: 'Fonepay not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!PRN || !AMT) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amt = parseFloat(AMT).toFixed(2);
    const dvInput = merchantCode + PRN + amt;
    const expectedDv = await hmacSha512Hex(secretKey, dvInput);

    const verified = DV && DV.toUpperCase() === expectedDv;

    if (!verified) {
      const isSuccess = fpStatus === 'success' || response_code === 'success';
      if (isSuccess) {
        const verifyResp = await fetch(FONEPAY_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ PID: merchantCode, PRN, AMT: amt, DV: expectedDv }),
        });
        if (verifyResp.ok) {
          const verifyResult = await verifyResp.json();
          if (verifyResult?.status === 'verified' || verifyResult?.response_code === 'success') {
            const fnUrl = Deno.env.get('INSFORGE_FUNCTIONS_URL') || '';
            await processPayment(fnUrl, anonKey, PRN, amt);
          }
        }
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fnUrl = Deno.env.get('INSFORGE_FUNCTIONS_URL') || '';
    await processPayment(fnUrl, anonKey, PRN, amt);

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function processPayment(fnUrl, anonKey, prn, amt) {
  if (!fnUrl) return;

  const updateResp = await fetch(`${fnUrl}/rest/v1/rpc/update_fonepay_transaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ p_transaction_id: prn, p_status: 'paid' }),
  });

  if (!updateResp.ok) {
    const errText = await updateResp.text();
    console.error('update_fonepay_transaction failed', errText);
  }

  const { data: txData } = await fetch(`${fnUrl}/rest/v1/fonepay_transactions?select=invoice_id&transaction_id=eq.${prn}&limit=1`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
    },
  }).then(r => r.json());

  if (txData?.[0]?.invoice_id) {
    await fetch(`${fnUrl}/rest/v1/rpc/process_payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        p_invoice_id: txData[0].invoice_id,
        p_amount: parseFloat(amt),
        p_method: 'fonepay',
        p_processed_by: null,
        p_idempotency_key: `fonepay-webhook:${prn}`,
        p_reference: prn,
        p_notes: 'FonePay webhook auto-verified',
      }),
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
