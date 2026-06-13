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

  try {
    const body = await req.json();
    const { action, ...params } = body;

    if (action === 'generate_qr') return await handleGenerateQR(params);
    if (action === 'check_status') return await handleCheckStatus(params);
    if (action === 'post_tax_refund') return await handlePostTaxRefund(params);

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('fonepay_error', err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

function getConfig() {
  const merchantCode = Deno.env.get('FONEPAY_MERCHANT_CODE');
  const secretKey = Deno.env.get('FONEPAY_SECRET_KEY');

  if (!merchantCode || !secretKey) {
    throw new Error('FONEPAY_MERCHANT_CODE and FONEPAY_SECRET_KEY must be set');
  }

  const isProduction = Deno.env.get('FONEPAY_IS_PRODUCTION') === 'true';

  return {
    merchantCode,
    secretKey,
    username: Deno.env.get('FONEPAY_USERNAME') || '',
    password: Deno.env.get('FONEPAY_PASSWORD') || '',
    qrTimeoutMinutes: parseInt(Deno.env.get('FONEPAY_QR_TIMEOUT_MINUTES') || '10', 10),
    baseUrl: isProduction
      ? 'https://merchantapi.fonepay.com/api'
      : 'https://dev-merchantapi.fonepay.com/convergent-merchant-web/api',
    anonKey: Deno.env.get('ANON_KEY') || '',
    functionsUrl: Deno.env.get('INSFORGE_FUNCTIONS_URL') || '',
  };
}

function generateServerPRN() {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return `FP${uuid.toUpperCase()}`;
}

async function dbRpc(config, rpcName, body) {
  if (!config.functionsUrl || !config.anonKey) {
    console.error('db_rpc_not_configured', rpcName);
    return null;
  }
  const url = `${config.functionsUrl}/api/database/rpc/${rpcName}`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey,
        'Authorization': `Bearer ${config.anonKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error('db_rpc_failed', JSON.stringify({ rpc: rpcName, status: resp.status, error: errText }));
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.error('db_rpc_error', JSON.stringify({ rpc: rpcName, error: err.message }));
    return null;
  }
}

function fetchWithTimeout(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

async function handleGenerateQR(params) {
  const { amount, invoice_id } = params;
  const config = getConfig();

  if (!amount || !invoice_id) {
    return jsonResponse({ success: false, error: 'amount and invoice_id are required' }, 400);
  }

  const amt = parseFloat(amount).toFixed(2);
  if (isNaN(parseFloat(amt)) || parseFloat(amt) <= 0) {
    return jsonResponse({ success: false, error: 'Invalid amount' }, 400);
  }

  const prn = generateServerPRN();
  const remarks1 = 'Highlands Cafe';
  const remarks2 = invoice_id ? `INV:${invoice_id}` : 'POS';

  const dvInput = amt + remarks1 + remarks2 + prn + config.merchantCode;
  const dv = await hmacSha512Hex(config.secretKey, dvInput);

  const payload = {
    amount: amt,
    remarks1,
    remarks2,
    prn,
    merchantCode: config.merchantCode,
    dataValidation: dv,
    username: config.username,
    password: config.password,
  };

  const url = `${config.baseUrl}/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload`;

  let resp;
  try {
    resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 15000);
  } catch (err) {
    console.error('fonepay_qr_api_timeout', JSON.stringify({ prn, error: err.message }));
    return jsonResponse({
      success: false,
      error: 'Fonepay QR API timed out. Please try again.',
    }, 504);
  }

  const result = await resp.json();

  if (!resp.ok) {
    console.error('fonepay_qr_api_error', JSON.stringify({ prn, invoice_id, status: resp.status, result }));
    return jsonResponse({
      success: false,
      error: result?.message || `QR API returned ${resp.status}`,
    }, resp.status);
  }

  const qrMessage = result.qrMessage || null;
  const wsUrl = result.thirdpartyQrWebSocketUrl || null;
  const qrTimeoutMinutes = config.qrTimeoutMinutes;
  const qrExpiry = new Date(Date.now() + qrTimeoutMinutes * 60 * 1000).toISOString();

  // Store transaction in database (cancels old active QR for same invoice)
  await dbRpc(config, 'log_fonepay_transaction', {
    p_invoice_id: invoice_id,
    p_transaction_id: prn,
    p_amount: parseFloat(amt),
    p_qr_expiry: qrExpiry,
  });

  console.log('fonepay_qr_generated', JSON.stringify({
    prn, invoice_id, amount: amt, merchant_code: config.merchantCode,
    status: result.status, qr_expiry: qrExpiry,
  }));

  return jsonResponse({
    success: true,
    qr_message: qrMessage,
    websocket_url: wsUrl,
    merchant_code: config.merchantCode,
    transaction_id: prn,
    amount: amt,
    status: result.status || 'CREATED',
    qr_timeout_minutes: qrTimeoutMinutes,
    qr_expiry: qrExpiry,
    raw_status_code: result.statusCode,
  });
}

async function handleCheckStatus(params) {
  const { prn } = params;
  const config = getConfig();

  if (!prn) {
    return jsonResponse({ success: false, error: 'prn is required' }, 400);
  }

  const dvInput = prn + config.merchantCode;
  const dv = await hmacSha512Hex(config.secretKey, dvInput);

  const payload = {
    prn,
    merchantCode: config.merchantCode,
    dataValidation: dv,
    username: config.username,
    password: config.password,
  };

  const url = `${config.baseUrl}/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus`;

  let resp;
  try {
    resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 10000);
  } catch (err) {
    console.error('fonepay_status_api_timeout', JSON.stringify({ prn, error: err.message }));
    return jsonResponse({
      success: false,
      error: 'Fonepay Status API timed out',
    }, 504);
  }

  const result = await resp.json();

  if (!resp.ok) {
    console.error('fonepay_status_api_error', JSON.stringify({ prn, status: resp.status, result }));
    return jsonResponse({
      success: false,
      error: result?.message || `Status API returned ${resp.status}`,
    }, resp.status);
  }

  const paymentStatus = (result.paymentStatus || '').toLowerCase();
  const isPaid = paymentStatus === 'success';

  console.log('fonepay_status_result', JSON.stringify({
    prn, paymentStatus, fonepayTraceId: result.fonepayTraceId, isPaid,
  }));

  return jsonResponse({
    success: true,
    verified: isPaid,
    payment_status: paymentStatus,
    fonepay_trace_id: result.fonepayTraceId || null,
    merchant_code: result.merchantCode || config.merchantCode,
    gateway_reference: result.fonepayTraceId ? String(result.fonepayTraceId) : null,
    prn: result.prn || prn,
  });
}

async function handlePostTaxRefund(params) {
  const { fonepayTraceId, merchantPRN, invoiceNumber, invoiceDate, transactionAmount } = params;
  const config = getConfig();

  if (!fonepayTraceId || !merchantPRN || !invoiceNumber || !invoiceDate || !transactionAmount) {
    return jsonResponse({
      success: false,
      error: 'fonepayTraceId, merchantPRN, invoiceNumber, invoiceDate, transactionAmount are required',
    }, 400);
  }

  const dvInput = fonepayTraceId + merchantPRN + invoiceNumber + invoiceDate + transactionAmount + config.merchantCode;
  const dv = await hmacSha512Hex(config.secretKey, dvInput);

  const payload = {
    fonepayTraceId,
    merchantPRN,
    invoiceNumber,
    invoiceDate,
    transactionAmount,
    merchantCode: config.merchantCode,
    dataValidation: dv,
    username: config.username,
    password: config.password,
  };

  const url = `${config.baseUrl}/merchant/merchantDetailsForThirdParty/thirdPartyPostTaxRefund`;

  let resp;
  try {
    resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 10000);
  } catch (err) {
    return jsonResponse({
      success: false,
      error: 'Tax refund API timed out',
    }, 504);
  }

  const result = await resp.json();

  if (!resp.ok) {
    return jsonResponse({
      success: false,
      error: result?.message || `Tax refund API returned ${resp.status}`,
    }, resp.status);
  }

  return jsonResponse({
    success: result.success === true,
    fonepay_trace_id: result.fonepayTraceId || null,
    message: result.message || 'Tax refund request submitted',
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
