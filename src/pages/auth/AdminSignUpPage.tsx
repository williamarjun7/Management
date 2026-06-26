import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../lib/core/auth-context';
import { insforge } from '../../lib/core/insforge';
import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { ShieldCheck, ChevronRight } from 'lucide-react';
import logoSrc from '../../assets/logo.png';

const signUpSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  adminCode: z.string().min(1, 'Admin registration code is required'),
});

type SignUpForm = z.infer<typeof signUpSchema>;

export default function AdminSignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpForm) => {
    setLoading(true);
    setError(null);

    try {
      const session = await insforge.auth.getCurrentUser();
      const token = session?.data?.user?.id ? ((await (insforge.auth as any).getSession())?.data as any)?.session?.access_token : null;

      const { error: verifyError } = await insforge.functions.invoke('verify-admin-code', {
        body: { code: data.adminCode },
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      });

      if (verifyError) {
        setError(verifyError.message || 'Invalid admin registration code');
        setLoading(false);
        return;
      }
    } catch {
      setError('Registration service unavailable. Please try again later.');
      setLoading(false);
      return;
    }

    const { error } = await signUp(data.email, data.password, data.name);
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#0a0a0a] flex-col justify-between p-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
        <div className="absolute top-20 -left-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 -right-20 w-80 h-80 bg-secondary/5 rounded-full blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt="Highlands Cafe & Motel Inn" className="h-10 w-10 rounded-full object-cover" />
            <div>
              <p className="text-lg font-bold text-foreground">Highlands Cafe & Motel Inn</p>
              <p className="text-xs text-muted-foreground">Administration</p>
            </div>
          </div>
        </div>
        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Why admin access?</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                Full system configuration and settings
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                User management and role assignments
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                Access to analytics and audit logs
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                Financial reports and system health
              </li>
            </ul>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Encrypted connection
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Role-based access
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-muted/30">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <img src={logoSrc} alt="Highlands Cafe & Motel Inn" className="h-9 w-9 rounded-full object-cover" />
            <div>
              <p className="text-base font-bold text-foreground">Highlands Cafe & Motel Inn</p>
              <p className="text-[10px] text-muted-foreground">Administration</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin Registration</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Create admin account</h1>
            <p className="text-sm text-muted-foreground">Register with your admin registration code</p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <input
                {...register('name')}
                type="text"
                className="w-full h-11 px-4 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="John Doe"
              />
              {errors.name && (
                <p className="text-destructive text-xs mt-1">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                {...register('email')}
                type="email"
                className="w-full h-11 px-4 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="admin@highlands.com"
              />
              {errors.email && (
                <p className="text-destructive text-xs mt-1">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <input
                {...register('password')}
                type="password"
                className="w-full h-11 px-4 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="text-destructive text-xs mt-1">{errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Admin Registration Code</label>
              <input
                {...register('adminCode')}
                type="password"
                className="w-full h-11 px-4 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="Enter admin code"
              />
              {errors.adminCode && (
                <p className="text-destructive text-xs mt-1">{errors.adminCode.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              {loading ? 'Creating account...' : 'Create admin account'}
              {!loading && <ChevronRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">Administration</span>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Already have admin access?{' '}
            <Link to="/admin/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
