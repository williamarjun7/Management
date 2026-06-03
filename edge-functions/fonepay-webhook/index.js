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
    const { PID, PRN, AMT, DV, status: fpStatus, response_code, response_message, reference_id } = body;

    const merchantCode = Deno.env.get('FONEPAY_MERCHANT_CODE');
    const secretKey = Deno.env.get('FONEPAY_SECRET_KEY');
    const anonKey = Deno.env.get('ANON_KEY');
    const fnUrl = Deno.env.get('INSFORGE_FUNCTIONS_URL') || '';

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

    const gatewayRef = reference_id || PRN;

    if (!verified) {
      const isSuccess = fpStatus === 'success' || response_code === 'success';
      if (isSuccess && fnUrl) {
        try {
          const verifyResp = await fetch(FONEPAY_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ PID: merchantCode, PRN, AMT: amt, DV: expectedDv }),
          });
          if (verifyResp.ok) {
            const verifyResult = await verifyResp.json();
            if (verifyResult?.status === 'verified' || verifyResult?.response_code === 'success') {
              await processPayment(fnUrl, anonKey, PRN, amt, gatewayRef);
            }
          }
        } catch (err) {
          console.error('fonepay_webhook_fallback_verify_failed', err.message);
        }
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (fnUrl) {
      await processPayment(fnUrl, anonKey, PRN, amt, gatewayRef);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('fonepay_webhook_error', err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

async function processPayment(fnUrl, anonKey, prn, amt, gatewayRef) {
  const authHeaders = {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`,
  };

  try {
    // Update fonepay transaction with gateway reference and paid amount
    const updateBody = {
      p_transaction_id: prn,
      p_status: 'paid',
      p_gateway_reference: gatewayRef || null,
      p_paid_amount: parseFloat(amt),
    };

    const updateResp = await fetch(`${fnUrl}/rest/v1/rpc/update_fonepay_transaction`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(updateBody),
    });

    if (!updateResp.ok) {
      const errText = await updateResp.text();
      console.error('update_fonepay_transaction_failed', errText);
    }

    // Look up invoice_id
    const txResp = await fetch(
      `${fnUrl}/rest/v1/fonepay_transactions?select=invoice_id&transaction_id=eq.${prn}&limit=1`,
      { headers: authHeaders }
    );
    const txData = await txResp.json();

    const invoiceId = txData?.[0]?.invoice_id;
    if (!invoiceId) {
      console.error('fonepay_webhook_no_invoice_found', prn);
      return;
    }

    // Record the payment
    const paymentResp = await fetch(`${fnUrl}/rest/v1/rpc/process_payment`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        p_invoice_id: invoiceId,
        p_amount: parseFloat(amt),
        p_method: 'fonepay',
        p_processed_by: null,
        p_idempotency_key: `fonepay-webhook:${prn}`,
        p_reference: gatewayRef || prn,
        p_notes: `FonePay auto-verified. Gateway Ref: ${gatewayRef || 'N/A'}`,
      }),
    });

    if (!paymentResp.ok) {
      const errText = await paymentResp.text();
      console.error('process_payment_via_webhook_failed', errText);
    } else {
      console.log('fonepay_payment_processed', JSON.stringify({ prn, invoiceId, amt, gatewayRef }));
    }
  } catch (err) {
    console.error('fonepay_webhook_process_payment_error', err.message);
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
