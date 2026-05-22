import { useState, useEffect, useRef, useCallback } from "react";
import { X, QrCode, RefreshCw, CheckCircle, AlertCircle, Timer, Search } from "lucide-react";
import { Button } from "./ui/button";
import { useFonepayQR, useVerifyFonepayPayment, useProcessPayment, useLogFonepayTransaction, useUpdateFonepayTransaction } from "../lib/hooks";
import { useAuth } from "../lib/core/auth-context";
import { showSuccess, showError, showInfo } from "./ui/toast";
import { formatCurrency } from "../lib/core/format-currency";
import type { Invoice } from "../types";
import QRCode from "qrcode";

interface FonepayQRDialogProps {
  invoice: Invoice;
  amount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 36;
const QR_TIMEOUT_MINUTES = 3;

export function FonepayQRDialog({ invoice, amount, onSuccess, onCancel }: FonepayQRDialogProps) {
  const { user } = useAuth();
  const generateQR = useFonepayQR();
  const verifyPayment = useVerifyFonepayPayment();
  const processPayment = useProcessPayment();
  const logTx = useLogFonepayTransaction();
  const updateTx = useUpdateFonepayTransaction();
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string>("");
  const [status, setStatus] = useState<"generating" | "displaying" | "polling" | "verifying" | "success" | "failed" | "timeout">("generating");
  const [error, setError] = useState<string | null>(null);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QR_TIMEOUT_MINUTES * 60);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [idempotencyKey] = useState(() => `fonepay:${invoice.id}:${Date.now()}`);
  const cancelledRef = useRef(false);

  const completePayment = useCallback(async (txId: string, amt: number) => {
    setStatus("verifying");
    try {
      const result = await processPayment.mutateAsync({
        p_invoice_id: invoice.id,
        p_amount: amt,
        p_method: "fonepay",
        p_processed_by: user!.id,
        p_idempotency_key: idempotencyKey,
        p_reference: txId,
        p_notes: `FonePay TX: ${txId}`,
      });

      const plId = result?.id || result?.payment_log_id || undefined;
      await updateTx.mutateAsync({ transactionId: txId, status: "paid", paymentLogId: plId });

      setStatus("success");
      showSuccess(`FonePay payment of ${formatCurrency(amt)} confirmed`);

      setTimeout(() => {
        if (typeof window !== "undefined") {
          window.print();
        }
        onSuccess();
      }, 500);
    } catch {
      setStatus("failed");
      setError("Payment was verified but failed to record. Please contact support.");
    }
  }, [invoice.id, processPayment, updateTx, user, idempotencyKey, onSuccess]);

  const startPolling = useCallback((txId: string, amt: number) => {
    setStatus("polling");
    let attempts = 0;

    pollTimerRef.current = setInterval(async () => {
      if (cancelledRef.current) return;
      attempts++;
      setPollAttempt(attempts);

      try {
        const result = await verifyPayment.mutateAsync({ transactionId: txId, amount: amt });
        if (cancelledRef.current) return;

        if (result.verified) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (countdownRef.current) clearInterval(countdownRef.current);
          await completePayment(txId, amt);
          return;
        }
      } catch {
        // retry on next interval
      }

      if (attempts >= MAX_POLL_ATTEMPTS) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
        setStatus("timeout");
        showInfo("QR code expired. Please try again.");
      }
    }, POLL_INTERVAL);
  }, [verifyPayment, completePayment]);

  const handleManualVerify = async () => {
    if (!transactionId) return;
    setStatus("verifying");
    try {
      const result = await verifyPayment.mutateAsync({ transactionId, amount });
      if (result.verified) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
        await completePayment(transactionId, amount);
      } else {
        setStatus("polling");
        showInfo("Payment not yet confirmed. Polling continues.");
      }
    } catch (err) {
      setStatus("polling");
      showError((err as Error)?.message || "Verification failed");
    }
  };

  useEffect(() => {
    cancelledRef.current = false;
    const amt = Math.round(amount * 100) / 100;
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const txId = `FP${ts}${rand}`;
    setTransactionId(txId);

    generateQR.mutateAsync({ amount: amt, transactionId: txId, invoiceId: invoice.id }).then(async (result) => {
      if (cancelledRef.current) return;
      if (result.payment_url) {
        try {
          const qrDataUrl = await QRCode.toDataURL(result.payment_url, {
            width: 300,
            margin: 2,
            color: { dark: "#000000", light: "#ffffff" },
          });
          if (cancelledRef.current) return;
          setQrImageUrl(qrDataUrl);
        } catch {
          // fallback: use payment_url as img src (external QR API fallback)
          setQrImageUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(result.payment_url)}`);
        }

        await logTx.mutateAsync({ invoiceId: invoice.id, transactionId: txId, amount: amt });

        setStatus("displaying");
        startPolling(txId, amt);

        countdownRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              if (countdownRef.current) clearInterval(countdownRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    }).catch((err) => {
      if (cancelledRef.current) return;
      setError((err as Error)?.message || "Failed to generate QR code");
      setStatus("failed");
    });

    return () => {
      cancelledRef.current = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const handleCancel = () => {
    cancelledRef.current = true;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (status !== "success") {
      updateTx.mutate({ transactionId, status: "expired" });
    }
    onCancel();
  };

  const handleRetry = () => {
    setStatus("generating");
    setError(null);
    setPollAttempt(0);
    setTimeLeft(QR_TIMEOUT_MINUTES * 60);
    setQrImageUrl(null);
    cancelledRef.current = false;
    const amt = Math.round(amount * 100) / 100;
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const txId = `FP${ts}${rand}`;
    setTransactionId(txId);
    generateQR.mutateAsync({ amount: amt, transactionId: txId, invoiceId: invoice.id }).then(async (result) => {
      if (cancelledRef.current) return;
      if (result.payment_url) {
        const qrDataUrl = await QRCode.toDataURL(result.payment_url, { width: 300, margin: 2 });
        if (cancelledRef.current) return;
        setQrImageUrl(qrDataUrl);
        await logTx.mutateAsync({ invoiceId: invoice.id, transactionId: txId, amount: amt });
        setStatus("displaying");
        startPolling(txId, amt);
        countdownRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) { if (countdownRef.current) clearInterval(countdownRef.current); return 0; }
            return prev - 1;
          });
        }, 1000);
      }
    }).catch((err) => {
      if (cancelledRef.current) return;
      setError((err as Error)?.message || "Failed to generate QR code");
      setStatus("failed");
    });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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
        </div>

        {status === "generating" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <RefreshCw className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Generating QR code...</p>
          </div>
        )}

        {status === "displaying" && qrImageUrl && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl border-2 border-border bg-white p-4">
              <img
                src={qrImageUrl}
                alt="FonePay QR"
                className="w-56 h-56 object-contain"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Scan this QR with your banking app to pay
            </p>
            <div className="flex items-center gap-1 text-xs text-amber-600">
              <Timer className="h-3 w-3" />
              <span>Expires in {formatTime(timeLeft)}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-1000"
                style={{ width: `${(timeLeft / (QR_TIMEOUT_MINUTES * 60)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {status === "polling" && (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Waiting for payment... ({pollAttempt}/{MAX_POLL_ATTEMPTS})</span>
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
            <CheckCircle className="h-12 w-12 text-green-500" />
            <p className="text-sm font-medium text-green-600">Payment successful!</p>
            <p className="text-xs text-muted-foreground">Receipt is printing...</p>
          </div>
        )}

        {status === "failed" && (
          <div className="flex flex-col items-center py-6 gap-2">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-sm font-medium text-destructive">{error || "Payment failed"}</p>
          </div>
        )}

        {status === "timeout" && (
          <div className="flex flex-col items-center py-6 gap-2">
            <Timer className="h-12 w-12 text-amber-500" />
            <p className="text-sm font-medium text-amber-600">QR code expired</p>
            <p className="text-xs text-muted-foreground">Generate a new QR to try again.</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-4">
          <div className="flex gap-2">
            {(status === "failed" || status === "timeout") && (
              <Button onClick={handleRetry} disabled={generateQR.isPending} className="min-h-[44px]">
                <RefreshCw className={`h-4 w-4 mr-1 ${generateQR.isPending ? "animate-spin" : ""}`} />
                Retry
              </Button>
            )}
            {status === "displaying" && (
              <Button variant="outline" onClick={handleCancel} className="min-h-[44px]">
                Cancel
              </Button>
            )}
          </div>
          {(status === "displaying" || status === "polling") && (
            <Button variant="secondary" onClick={handleManualVerify} disabled={verifyPayment.isPending} className="min-h-[44px]">
              <Search className="h-4 w-4 mr-1" />
              {verifyPayment.isPending ? "Checking..." : "Verify"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
