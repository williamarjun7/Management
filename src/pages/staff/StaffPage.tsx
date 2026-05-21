import { useNavigate } from 'react-router-dom';
import { Bell, Bed, UtensilsCrossed, ShoppingCart, ChefHat, ClipboardList, ChevronRight, Scan, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '../../lib/core/auth-context';
import { showSuccess } from '../../components/ui/toast';

interface TaskItem {
  id: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  time: string;
  borderColor: string;
  dotColor?: string;
}

interface ActivityItem {
  id: string;
  icon: React.ElementType;
  iconColor: string;
  text: string;
  time: string;
  priority?: string;
}

const tasks: TaskItem[] = [
  { id: '1', icon: Bed, title: 'Room 204', subtitle: 'Deep Clean Requested', time: '15 mins ago', borderColor: 'border-l-[#FF8A00]', dotColor: 'bg-[#FF8A00]' },
  { id: '2', icon: ChefHat, title: 'Room 112', subtitle: 'Breakfast Delivery', time: '08:30 AM', borderColor: 'border-l-secondary' },
  { id: '3', icon: ClipboardList, title: 'Main Lobby', subtitle: 'Check Wifi Router', time: '09:00 AM', borderColor: 'border-l-muted-foreground' },
];

const activities: ActivityItem[] = [
  { id: '1', icon: Bell, iconColor: 'text-destructive', text: 'Guest 301 triggered "Service Required" button', time: '2 mins ago', priority: 'High Priority' },
  { id: '2', icon: CheckCircle, iconColor: 'text-secondary', text: 'Checkout complete for Room 105', time: '12 mins ago' },
];

export default function StaffPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#0F1115] text-on-surface font-body-md relative pb-32">
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-[44px] bg-background/80 backdrop-blur-xl border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span className="text-sm font-black text-on-surface">Highlands Suite</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Bell className="h-5 w-5 text-on-surface-variant" />
            <span className="absolute top-0 right-0 w-2 h-2 bg-destructive rounded-full border-2 border-background" />
          </div>
          <div className="w-8 h-8 rounded-full border border-outline-variant bg-surface-container-highest flex items-center justify-center">
            <span className="text-xs font-bold text-primary">
              {(user?.name ?? user?.email ?? 'S').charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      </header>

      <main className="pt-20 pb-8 px-6 space-y-6">
        <section className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border-l-4 border-primary p-4 flex flex-col justify-between h-32" style={{ background: 'rgba(32, 31, 31, 0.6)', backdropFilter: 'blur(20px)' }}>
            <span className="text-xs font-semibold text-on-surface-variant tracking-wider">ROOMS CLEANED</span>
            <div className="flex items-end justify-between">
              <span className="text-5xl font-bold leading-none text-on-surface">12<span className="text-sm font-medium text-on-surface-variant ml-1">/15</span></span>
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div className="rounded-xl border-l-4 border-secondary p-4 flex flex-col justify-between h-32" style={{ background: 'rgba(32, 31, 31, 0.6)', backdropFilter: 'blur(20px)' }}>
            <span className="text-xs font-semibold text-on-surface-variant tracking-wider">PENDING TASKS</span>
            <div className="flex items-end justify-between">
              <span className="text-5xl font-bold leading-none text-on-surface">04</span>
              <Clock className="h-6 w-6 text-secondary" />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-on-surface">Quick Entry</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            <button
              onClick={() => navigate('/pos')}
              className="flex-shrink-0 bg-primary text-on-primary px-6 py-3 rounded-full flex items-center gap-2 text-sm font-medium active:scale-95 transition-transform min-h-[44px]"
            >
              <ShoppingCart className="h-5 w-5" />
              Open POS
            </button>
            <button
              onClick={() => showSuccess('Open a new service request')}
              className="flex-shrink-0 px-6 py-3 rounded-full flex items-center gap-2 text-sm font-medium active:scale-95 transition-transform min-h-[44px]" style={{ background: 'rgba(32, 31, 31, 0.6)', backdropFilter: 'blur(20px)' }}
            >
              <ClipboardList className="h-5 w-5" />
              New Request
            </button>
            <button
              onClick={() => showSuccess('Contact support for assistance')}
              className="flex-shrink-0 px-6 py-3 rounded-full flex items-center gap-2 text-sm font-medium active:scale-95 transition-transform min-h-[44px]" style={{ background: 'rgba(32, 31, 31, 0.6)', backdropFilter: 'blur(20px)' }}
            >
              <ChefHat className="h-5 w-5" />
              Help
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-on-surface">Active Assignments</h2>
            <button onClick={() => navigate('/orders')} className="text-primary text-xs font-medium">View All</button>
          </div>
          <div className="space-y-3">
            {tasks.map((task) => {
              const Icon = task.icon;
              return (
                <div key={task.id} className="relative group" onClick={() => navigate('/motel')}>
                  <div className={`rounded-xl border-l-4 p-5 flex items-center justify-between relative z-10 transition-transform active:scale-[0.98] ${task.borderColor}`} style={{ background: 'rgba(32, 31, 31, 0.6)', backdropFilter: 'blur(20px)' }}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-surface-container-highest flex items-center justify-center">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-tight text-on-surface">{task.title}</p>
                        <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                          {task.dotColor && <span className={`w-2 h-2 rounded-full ${task.dotColor}`} />}
                          {task.subtitle}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-on-surface">{task.time}</p>
                      <ChevronRight className="h-4 w-4 text-on-surface-variant opacity-50 ml-auto" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-on-surface">Activity Feed</h2>
          <div className="space-y-4">
            {activities.map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.id} className="flex gap-3 items-start border-b border-outline-variant/10 pb-4">
                  <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${a.iconColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-on-surface">{a.text}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {a.time}{a.priority && ` • ${a.priority}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-outline-variant/10">
        <div className="flex items-center justify-around h-20 px-6">
          <button onClick={() => navigate('/dashboard')} className="flex flex-col items-center gap-1 text-primary">
            <ChefHat className="h-5 w-5" />
            <span className="text-[10px] font-semibold">Operations</span>
          </button>
          <button onClick={() => navigate('/motel')} className="flex flex-col items-center gap-1 text-on-surface-variant opacity-60">
            <Bed className="h-5 w-5" />
            <span className="text-[10px] font-semibold">Rooms</span>
          </button>
          <button onClick={() => navigate('/pos')} className="-mt-6 flex items-center justify-center">
            <div className="w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-transform">
              <Scan className="h-7 w-7" />
            </div>
          </button>
          <button onClick={() => navigate('/kitchen')} className="flex flex-col items-center gap-1 text-on-surface-variant opacity-60">
            <UtensilsCrossed className="h-5 w-5" />
            <span className="text-[10px] font-semibold">KDS</span>
          </button>
          <button onClick={() => navigate('/analytics')} className="flex flex-col items-center gap-1 text-on-surface-variant opacity-60">
            <ClipboardList className="h-5 w-5" />
            <span className="text-[10px] font-semibold">Analytics</span>
          </button>
        </div>
      </nav>

      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 pointer-events-none opacity-40">
        <span className="text-xs text-on-surface-variant">SWIPE LEFT TO COMPLETE</span>
      </div>
    </div>
  );
}
