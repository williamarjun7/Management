import { useState, useRef, useEffect, type KeyboardEvent, type ClipboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/core/auth-context';
import { Mail, ArrowLeft, RefreshCw } from 'lucide-react';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 30;

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return local[0] + '***@' + domain;
}

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { pendingEmail, verifyEmail, resendVerificationCode, authStatus, loading } = useAuth();
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const verifyButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!loading && authStatus === 'authenticated') {
      navigate('/dashboard', { replace: true });
    }
  }, [authStatus, loading, navigate]);

  useEffect(() => {
    if (!loading && !pendingEmail && authStatus !== 'verification_pending') {
      navigate('/signup', { replace: true });
    }
  }, [pendingEmail, authStatus, loading, navigate]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setError(null);
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!text) return;
    const next = [...otp];
    for (let i = 0; i < text.length; i++) {
      next[i] = text[i];
    }
    setOtp(next);
    setError(null);
    const focusIdx = Math.min(text.length, OTP_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
  }

  const otpString = otp.join('');
  const isValid = otpString.length === OTP_LENGTH;

  useEffect(() => {
    if (isValid && verifyButtonRef.current) {
      verifyButtonRef.current.click();
    }
  }, [isValid]);

  async function handleVerify() {
    if (!isValid || verifying) return;
    setVerifying(true);
    setError(null);
    const { error } = await verifyEmail(otpString);
    setVerifying(false);
    if (error) {
      const msg = (error as Error).message || '';
      if (msg.toLowerCase().includes('expired')) {
        setError('Verification code expired. Request a new one.');
      } else if (msg.toLowerCase().includes('invalid')) {
        setError('Invalid verification code. Check your email and try again.');
      } else if (msg.toLowerCase().includes('rate')) {
        setError('Too many attempts. Please wait and try again.');
      } else {
        setError(msg || 'Verification failed. Try again.');
      }
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    }
  }

  async function handleResend() {
    if (resending || cooldown > 0) return;
    setResending(true);
    setError(null);
    const { error } = await resendVerificationCode();
    setResending(false);
    if (error) {
      setError((error as Error).message || 'Failed to resend code');
    } else {
      setCooldown(RESEND_COOLDOWN);
      setOtp(Array(OTP_LENGTH).fill(''));
      setError(null);
      inputRefs.current[0]?.focus();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md space-y-6 bg-card p-4 sm:p-8 rounded-xl border shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Check your email</h1>
          <p className="text-sm text-muted-foreground mt-2">
            We sent a verification code to
          </p>
          <p className="text-sm font-semibold mt-0.5">
            {pendingEmail ? maskEmail(pendingEmail) : 'your email'}
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md text-center">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex justify-center gap-1 sm:gap-2" role="group" aria-label="Verification code input">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                maxLength={1}
                className="h-14 w-10 sm:w-11 rounded-lg border border-border bg-background text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                disabled={verifying}
                aria-label={`Digit ${i + 1}`}
              />
            ))}
          </div>

          <button
            ref={verifyButtonRef}
            onClick={handleVerify}
            disabled={!isValid || verifying}
            className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {verifying ? 'Verifying...' : 'Verify email'}
          </button>
        </div>

        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Didn&apos;t receive the code?{' '}
            <button
              onClick={handleResend}
              disabled={cooldown > 0 || resending}
              className="text-primary hover:underline disabled:no-underline disabled:text-muted-foreground disabled:cursor-not-allowed inline-flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${resending ? 'animate-spin' : ''}`} />
              {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending...' : 'Resend code'}
            </button>
          </p>
          <button
            onClick={() => navigate('/login')}
            className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
