const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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

  const secret = Deno.env.get('FONEPAY_WEBHOOK_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (secret && (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== secret)) {
    console.error('fonepay_webhook_unauthorized');
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
      console.error('fonepay_webhook_not_configured');
      return new Response(JSON.stringify({ error: 'Fonepay not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!PRN || !AMT) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isSuccess = fpStatus === 'success' || response_code === 'success';

    const amt = parseFloat(AMT).toFixed(2);
    const dvInput = merchantCode + PRN + amt;
    const expectedDv = await hmacSha512Hex(secretKey, dvInput);
    const verified = DV && DV.toUpperCase() === expectedDv;

    if (!verified) {
      console.warn('fonepay_webhook_hmac_mismatch', JSON.stringify({ PRN, amt }));
      if (isSuccess) {
        console.log('fonepay_webhook_fallback_attempt', JSON.stringify({ PRN }));
        try {
          const statusResult = await checkFonepayStatus(fnUrl, anonKey, merchantCode, secretKey, PRN);
          if (statusResult?.verified) {
            const processed = await processPayment(fnUrl, anonKey, PRN, amt, reference_id || PRN);
            if (!processed) {
              console.error('fonepay_webhook_fallback_process_failed', JSON.stringify({ PRN }));
              return new Response(JSON.stringify({ error: 'Payment processing failed' }), {
                status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            console.log('fonepay_webhook_fallback_success', JSON.stringify({ PRN }));
            return new Response(JSON.stringify({ received: true }), {
              status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } catch (err) {
          console.error('fonepay_webhook_fallback_verify_failed', err.message);
        }
      }
      return new Response(JSON.stringify({ error: 'Verification failed' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const processed = await processPayment(fnUrl, anonKey, PRN, amt, reference_id || PRN);
    if (!processed) {
      console.error('fonepay_webhook_process_failed', JSON.stringify({ PRN }));
      return new Response(JSON.stringify({ error: 'Payment processing failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('fonepay_webhook_success', JSON.stringify({ PRN, amt, gatewayRef: reference_id }));
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

async function checkFonepayStatus(fnUrl, anonKey, merchantCode, secretKey, prn) {
  const dvInput = prn + merchantCode;
  const dv = await hmacSha512Hex(secretKey, dvInput);

  const payload = {
    prn,
    merchantCode,
    dataValidation: dv,
    username: Deno.env.get('FONEPAY_USERNAME') || '',
    password: Deno.env.get('FONEPAY_PASSWORD') || '',
  };

  const isProduction = Deno.env.get('FONEPAY_IS_PRODUCTION') === 'true';
  const baseUrl = isProduction
    ? 'https://merchantapi.fonepay.com/api'
    : 'https://uat-new-merchant-api.fonepay.com/api';
  const url = baseUrl + '/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) return null;
    const result = await resp.json();
    const paymentStatus = (result.paymentStatus || '').toLowerCase();
    return {
      verified: paymentStatus === 'success',
      payment_status: paymentStatus,
      fonepay_trace_id: result.fonepayTraceId || null,
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function processPayment(fnUrl, anonKey, prn, amt, gatewayRef) {
  const authHeaders = {
    'Content-Type': 'application/json',
    'apikey': anonKey,
    'Authorization': 'Bearer ' + anonKey,
  };

  try {
    const txResp = await fetch(
      fnUrl + '/api/database/records/fonepay_transactions?select=invoice_id,amount,status,locked_for_payment&transaction_id=eq.' + prn + '&limit=1',
      { headers: authHeaders }
    );

    if (!txResp.ok) {
      console.error('fonepay_webhook_tx_lookup_failed', JSON.stringify({ prn, status: txResp.status }));
      return false;
    }

    const txData = await txResp.json();
    const txRecord = txData?.[0];

    if (!txRecord) {
      console.error('fonepay_webhook_tx_not_found', JSON.stringify({ prn }));
      return false;
    }

    const invoiceId = txRecord.invoice_id;
    const storedAmount = parseFloat(txRecord.amount);

    if (Math.abs(storedAmount - parseFloat(amt)) > 0.01) {
      console.error('fonepay_webhook_amount_mismatch',
        JSON.stringify({ prn, stored: storedAmount, received: parseFloat(amt) }));
      return false;
    }

    if (txRecord.status === 'COMPLETED' || txRecord.status === 'paid') {
      console.log('fonepay_webhook_already_processed', JSON.stringify({ prn, status: txRecord.status }));
      return true;
    }

    const paymentResp = await fetch(fnUrl + '/api/database/rpc/process_payment', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        p_invoice_id: invoiceId,
        p_amount: parseFloat(amt),
        p_method: 'fonepay',
        p_processed_by: null,
        p_idempotency_key: 'fonepay-webhook:' + prn,
        p_reference: gatewayRef || prn,
        p_notes: 'FonePay auto-verified. Gateway Ref: ' + (gatewayRef || 'N/A'),
        p_transaction_id: prn,
      }),
    });

    if (!paymentResp.ok) {
      const errText = await paymentResp.text();
      console.error('process_payment_via_webhook_failed', errText);
      return false;
    }

    const result = await paymentResp.json();
    if (result?.error) {
      console.error('process_payment_via_webhook_error', JSON.stringify({ prn, error: result.error }));
      return false;
    }

    console.log('fonepay_payment_processed', JSON.stringify({ prn, invoiceId, amt, gatewayRef }));
    return true;
  } catch (err) {
    console.error('fonepay_webhook_process_payment_error', err.message);
    return false;
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
