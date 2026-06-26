import { useState, useEffect, useRef, useCallback } from "react";
import { X, QrCode, RefreshCw, CheckCircle, AlertCircle, Timer, Search, Zap, Wifi, WifiOff } from "lucide-react";
import { Button } from "./ui/button";
import { useFonepayQR, useCheckFonepayStatus, useProcessPayment, useUpdateFonepayTransaction } from "../lib/hooks";
import { useAuth } from "../lib/core/auth-context";
import { showSuccess, showError, showInfo } from "./ui/toast";
import { formatCurrency } from "../lib/core/format-currency";
import { markInvoicePaidAndSync } from "../lib/services/payment-workflow";
import type { Invoice, QRPaymentStatus } from "../types";
import QRCode from "qrcode";

interface FonepayQRDialogProps {
  invoice: Invoice;
  amount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 72;
const QR_TIMEOUT_MINUTES = 10;
const WS_CONNECT_TIMEOUT_MS = 8000;
const WS_RECONNECT_MAX_ATTEMPTS = 3;
const WS_RECONNECT_BASE_DELAY_MS = 1000;

export function FonepayQRDialog({ invoice, amount, onSuccess, onCancel }: FonepayQRDialogProps) {
  const { user } = useAuth();
  const generateQR = useFonepayQR();
  const checkStatus = useCheckFonepayStatus();
  const processPayment = useProcessPayment();
  const updateTx = useUpdateFonepayTransaction();

  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [status, setStatus] = useState<QRPaymentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QR_TIMEOUT_MINUTES * 60);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [idempotencyKey] = useState(() => `fonepay:${invoice.id}:${Date.now()}`);
  const cancelledRef = useRef(false);
  const paymentCompleteRef = useRef(false);

  const cleanupTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (wsConnectTimeoutRef.current) {
      clearTimeout(wsConnectTimeoutRef.current);
      wsConnectTimeoutRef.current = null;
    }
    if (wsReconnectTimerRef.current) {
      clearTimeout(wsReconnectTimerRef.current);
      wsReconnectTimerRef.current = null;
    }
  }, []);

  const closeWebSocket = useCallback(() => {
    if (wsConnectTimeoutRef.current) {
      clearTimeout(wsConnectTimeoutRef.current);
      wsConnectTimeoutRef.current = null;
    }
    if (wsReconnectTimerRef.current) {
      clearTimeout(wsReconnectTimerRef.current);
      wsReconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const completePayment = useCallback(async (txId: string, amt: number, gwRef?: string) => {
    if (paymentCompleteRef.current) return;
    paymentCompleteRef.current = true;

    setStatus("verifying");
    try {
      // process_payment atomically: inserts payment_log, updates fonepay_transactions,
      // updates invoice status — all in one DB transaction
      const result = await processPayment.mutateAsync({
        p_invoice_id: invoice.id,
        p_amount: amt,
        p_method: "fonepay",
        p_processed_by: user!.id,
        p_idempotency_key: idempotencyKey,
        p_reference: gwRef || txId,
        p_notes: gwRef ? `FonePay TX: ${txId}, Gateway Ref: ${gwRef}` : `FonePay TX: ${txId}`,
        p_transaction_id: txId,
      });

      // Best-effort fallback: update fonepay_transaction status in case process_payment
      // was called without p_transaction_id (e.g., old client). Non-blocking.
      updateTx.mutate({
        transactionId: txId,
        status: "paid",
        paymentLogId: result?.payment_log_id || result?.id || undefined,
        gatewayReference: gwRef,
        paidAmount: amt,
      });

      setStatus("success");
      showSuccess(`FonePay payment of ${formatCurrency(amt)} confirmed`);

      // Mark paid and sync AFTER DB transaction commits
      await markInvoicePaidAndSync(invoice.id).catch(() => {});

      // Only print receipt AFTER payment is committed in DB
      setTimeout(() => {
        if (typeof window !== "undefined") {
          void window.print();
        }
        onSuccess();
      }, 500);
    } catch {
      paymentCompleteRef.current = false;
      setStatus("failed");
      setError("Payment was verified but failed to record. Please contact support.");
    }
  }, [invoice.id, processPayment, updateTx, user, idempotencyKey, onSuccess]);

  const handlePaymentStatus = useCallback(async (txId: string, amt: number, gwRef?: string) => {
    if (paymentCompleteRef.current) return;

    setStatus("verifying");

    // CRITICAL: Always call Status API as source of truth before completing payment
    try {
      const statusResult = await checkStatus.mutateAsync({ prn: txId });
      if (cancelledRef.current) return;

      if (statusResult.verified) {
        const traceId = gwRef || statusResult.gateway_reference || undefined;
        await completePayment(txId, amt, traceId);
      } else {
        setStatus("displaying");
        showInfo("Payment not yet confirmed by Fonepay. Still checking...");
      }
    } catch (err) {
      setStatus("displaying");
      showError((err as Error)?.message || "Verification failed");
    }
  }, [checkStatus, completePayment]);

  const connectWebSocket = useCallback((url: string, txId: string, amt: number, reconnectAttempt = 0) => {
    if (cancelledRef.current || paymentCompleteRef.current) return;

    try {
      closeWebSocket();
      setWsStatus(reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

      const ws = new WebSocket(url);
      wsRef.current = ws;

      // Connection timeout
      wsConnectTimeoutRef.current = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
          ws.close();
          setWsStatus('disconnected');
          console.debug('fonepay_ws_connect_timeout', txId);
        }
      }, WS_CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        if (wsConnectTimeoutRef.current) {
          clearTimeout(wsConnectTimeoutRef.current);
          wsConnectTimeoutRef.current = null;
        }
        setWsStatus('connected');
        console.debug('fonepay_ws_connected', txId);
      };

      ws.onmessage = (event) => {
        if (cancelledRef.current || paymentCompleteRef.current) return;
        try {
          const data = JSON.parse(event.data);
          const txStatus = data.transactionStatus;

          if (txStatus) {
            if (txStatus.qrVerified === true) {
              console.debug('fonepay_qr_verified', { prn: txId });
              return;
            }

            if (txStatus.paymentSuccess === true) {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              if (countdownRef.current) clearInterval(countdownRef.current);
              const gwRef = txStatus.productNumber || undefined;
              handlePaymentStatus(txId, amt, gwRef);
              return;
            }

            if (txStatus.paymentSuccess === false && txStatus.message === 'Request Failed') {
              console.debug('fonepay_payment_failed', { prn: txId, message: txStatus.message });
              return;
            }
          }
        } catch {
          console.debug('fonepay_ws_parse_error', event.data);
        }
      };

      ws.onerror = () => {
        setWsStatus('disconnected');
        console.debug('fonepay_ws_error', txId);
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        console.debug('fonepay_ws_closed', txId);

        // Reconnect logic with exponential backoff
        if (!cancelledRef.current && !paymentCompleteRef.current && reconnectAttempt < WS_RECONNECT_MAX_ATTEMPTS) {
          const delay = WS_RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempt);
          wsReconnectTimerRef.current = setTimeout(() => {
            // eslint-disable-next-line react-hooks/immutability
            connectWebSocket(url, txId, amt, reconnectAttempt + 1);
          }, delay);
        }
      };
    } catch (err) {
      setWsStatus('disconnected');
      console.debug('fonepay_ws_connect_failed', txId, err);
    }
  }, [closeWebSocket, handlePaymentStatus]);

  const startPolling = useCallback((txId: string) => {
    let attempts = 0;

    pollTimerRef.current = setInterval(async () => {
      if (cancelledRef.current) return;
      attempts++;
      setPollAttempt(attempts);

      try {
        const result = await checkStatus.mutateAsync({ prn: txId });
        if (cancelledRef.current) return;

        if (result.verified) {
          cleanupTimers();
          closeWebSocket();
          await completePayment(txId, amount, result.gateway_reference || undefined);
          return;
        }
      } catch {
        console.debug('fonepay_poll_retry', txId);
      }

      if (attempts >= MAX_POLL_ATTEMPTS) {
        cleanupTimers();
        closeWebSocket();
        setStatus("expired");
        showInfo("QR code expired. Please generate a new one.");
      }
    }, POLL_INTERVAL);
  }, [checkStatus, completePayment, amount, cleanupTimers, closeWebSocket]);

  const getRemarks1 = () => {
    const items = invoice.invoice_items;
    if (items && items.length > 0) {
      let label = items.slice(0, 3).map(i => {
        const qty = i.quantity > 1 ? `${i.quantity}x ` : "";
        return `${qty}${i.description}`;
      }).join(", ");
      if (items.length > 3) label += "...";
      return label.length > 40 ? label.slice(0, 39) + "…" : label;
    }
    if (invoice.booking_id) return "Room Booking";
    if (invoice.order_id) return "Cafe Order";
    return "Highlands Cafe & Motel Inn";
  };

  const handleGenerateQR = async () => {
    if (generateQR.isPending) return;
    cancelledRef.current = false;
    paymentCompleteRef.current = false;
    setStatus("generating");
    setError(null);
    setPollAttempt(0);
    setQrImageUrl(null);

    cleanupTimers();
    closeWebSocket();

    const amt = Math.round(amount * 100) / 100;
    const remarks1 = getRemarks1();
    const remarks2 = invoice.invoice_number || `INV:${invoice.id}`;

    try {
      const result = await generateQR.mutateAsync({ amount: amt, invoiceId: invoice.id, remarks1, remarks2 });
      if (cancelledRef.current) return;

      const txId = result.transaction_id;
      if (!txId) {
        setError("Failed to generate QR: no transaction ID returned");
        setStatus("failed");
        return;
      }

      setTransactionId(txId);
      setTimeLeft(QR_TIMEOUT_MINUTES * 60);

      const qrContent = result.qr_message;
      if (!qrContent) {
        setError("Failed to generate QR: no QR message returned");
        setStatus("failed");
        return;
      }

      const qrDataUrl = await QRCode.toDataURL(qrContent, {
        width: 400,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      if (cancelledRef.current) return;
      setQrImageUrl(qrDataUrl);

      setStatus("displaying");

      if (result.websocket_url) {
        connectWebSocket(result.websocket_url, txId, amt);
      }

      startPolling(txId);

      countdownRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      if (cancelledRef.current) return;
      setError((err as Error)?.message || "Failed to generate QR code");
      setStatus("failed");
    }
  };

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      cleanupTimers();
      closeWebSocket();
    };
  }, [cleanupTimers, closeWebSocket]);

  const handleManualVerify = async () => {
    if (!transactionId) return;
    await handlePaymentStatus(transactionId, amount);
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    cleanupTimers();
    closeWebSocket();
    if (status !== "success" && transactionId) {
      updateTx.mutate({ transactionId, status: "expired" });
    }
    onCancel();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const timerPercent = (timeLeft / (QR_TIMEOUT_MINUTES * 60)) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <QrCode className="h-5 w-5" /> FonePay QR
          </h2>
          {status !== "success" && (
            <button type="button" onClick={handleCancel} className="min-h-[44px] min-w-[44px] rounded-sm opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mb-4 rounded-lg border bg-muted p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Invoice</span>
            <span className="font-medium">{invoice.invoice_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-bold text-lg">{formatCurrency(amount)}</span>
          </div>
          {transactionId && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">TX ID</span>
              <span className="font-mono">{transactionId}</span>
            </div>
          )}
        </div>

        {status === "idle" && (
          <div className="flex flex-col items-center py-6 gap-4">
            <div className="w-20 h-20 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <QrCode className="h-10 w-10 text-blue-600" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Generate a QR code your customer can scan from their mobile banking app to pay instantly
            </p>
            <Button onClick={handleGenerateQR} disabled={generateQR.isPending} className="min-h-[48px] w-full text-base gap-2">
              {generateQR.isPending ? (
                <><RefreshCw className="h-5 w-5 animate-spin" /> Generating...</>
              ) : (
                <><Zap className="h-5 w-5" /> Generate QR Code</>
              )}
            </Button>
          </div>
        )}

        {status === "generating" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <RefreshCw className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Generating QR code...</p>
          </div>
        )}

        {status === "displaying" && qrImageUrl && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl border-2 border-border bg-white p-2 sm:p-3">
              <img
                src={qrImageUrl}
                alt="FonePay QR"
                className="w-72 h-72 sm:w-80 sm:h-80 object-contain"
              />
            </div>
            <div className="w-full max-w-xs flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground text-center">
                Open your <strong>mobile banking app</strong> → <strong>Scan QR</strong> → <strong>Confirm</strong>
              </p>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {wsStatus === 'connected' ? (
                  <Wifi className="h-3.5 w-3.5 text-green-500" />
                ) : wsStatus === 'reconnecting' ? (
                  <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-gray-400" />
                )}
                <span className="text-[10px] text-muted-foreground">
                  {wsStatus === 'connected' ? 'Live' :
                   wsStatus === 'reconnecting' ? 'Reconnecting...' :
                   wsStatus === 'connecting' ? 'Connecting...' :
                   'Polling'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm font-medium">
              <Timer className={`h-4 w-4 ${timeLeft < 60 ? "text-destructive" : "text-amber-600"}`} />
              <span className={timeLeft < 60 ? "text-destructive" : "text-amber-600"}>
                Expires in {formatTime(timeLeft)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-1000 ${
                  timeLeft < 60 ? "bg-destructive" : timeLeft < 120 ? "bg-amber-500" : "bg-primary"
                }`}
                style={{ width: `${timerPercent}%` }}
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-xs text-blue-700 dark:text-blue-300 animate-pulse">
              <Search className="h-3.5 w-3.5" />
              <span>Waiting for payment confirmation...</span>
            </div>
          </div>
        )}

        {status === "polling" && (
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Checking payment status... ({pollAttempt}/{MAX_POLL_ATTEMPTS})</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${(pollAttempt / MAX_POLL_ATTEMPTS) * 100}%` }}
              />
            </div>
          </div>
        )}

        {status === "verifying" && (
          <div className="flex flex-col items-center py-6 gap-2">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Verifying payment...</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center py-6 gap-2">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <p className="text-base font-semibold text-green-600">Payment Successful!</p>
            <p className="text-xs text-muted-foreground">Receipt is printing...</p>
          </div>
        )}

        {status === "failed" && (
          <div className="flex flex-col items-center py-6 gap-2">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertCircle className="h-10 w-10 text-destructive" />
            </div>
            <p className="text-sm font-medium text-destructive">{error || "Payment failed"}</p>
            <p className="text-xs text-muted-foreground text-center">You can try again or choose a different payment method.</p>
          </div>
        )}

        {status === "expired" && (
          <div className="flex flex-col items-center py-6 gap-2">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/20 flex items-center justify-center">
              <Timer className="h-10 w-10 text-amber-500" />
            </div>
            <p className="text-sm font-medium text-amber-600">QR code expired</p>
            <p className="text-xs text-muted-foreground text-center">Generate a new QR code to try again.</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
          <div className="flex gap-2">
            {(status === "failed" || status === "expired") && (
              <Button onClick={handleGenerateQR} disabled={generateQR.isPending} className="min-h-[44px]">
                <RefreshCw className={`h-4 w-4 mr-1 ${generateQR.isPending ? "animate-spin" : ""}`} />
                Regenerate QR
              </Button>
            )}
            {(status === "displaying" || status === "polling" || status === "idle") && (
              <Button variant="outline" onClick={handleCancel} className="min-h-[44px]">
                Cancel
              </Button>
            )}
          </div>
          {(status === "displaying" || status === "polling") && (
            <Button variant="secondary" onClick={handleManualVerify} disabled={checkStatus.isPending} className="min-h-[44px]">
              <Search className="h-4 w-4 mr-1" />
              {checkStatus.isPending ? "Checking..." : "Refresh Status"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
