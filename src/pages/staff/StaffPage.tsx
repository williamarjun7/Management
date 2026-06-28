import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, Bed, UtensilsCrossed, ShoppingCart, ChefHat, ClipboardList, ChevronRight, Scan, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { cn } from '../../lib/core/utils';
import { useAuth } from '../../lib/core/auth-context';
import logoSrc from '../../assets/logo.png';
import { insforge } from '../../lib/core/insforge';
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

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

export default function StaffPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cleanedRooms, setCleanedRooms] = useState(0);
  const [totalRooms, setTotalRooms] = useState(0);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    (async () => {
      const [roomsRes, hkRes, mtRes, eventsRes] = await Promise.all([
        insforge.database.from('rooms').select('status'),
        insforge.database.from('housekeeping_tasks').select('id, room_id, task_type, status, priority, created_at, updated_at').order('created_at', { ascending: false }).limit(10),
        insforge.database.from('maintenance_tasks').select('id, room_id, issue_description, priority, status, created_at').order('created_at', { ascending: false }).limit(10),
        insforge.database.from('system_events').select('id, event_type, entity_type, entity_id, payload, created_at').order('created_at', { ascending: false }).limit(10),
      ]);

      if (!roomsRes.error && roomsRes.data) {
        const rooms = roomsRes.data as { status: string }[];
        setTotalRooms(rooms.length);
        setCleanedRooms(rooms.filter(r => r.status === 'available' || r.status === 'cleaning').length);
      }

      const housekeeping = ((hkRes.data ?? []) as { id: string; room_id: string; task_type: string; status: string; priority: string; created_at: string }[]);
      const maintenance = ((mtRes.data ?? []) as { id: string; room_id: string; issue_description: string; priority: string; status: string; created_at: string }[]);

      setPendingTasks(housekeeping.filter(t => t.status === 'pending').length + maintenance.filter(t => t.status === 'reported').length);

      const taskList: TaskItem[] = [
        ...housekeeping.slice(0, 3).map(t => ({
          id: t.id, icon: Bed, title: `Room ${t.room_id?.slice(0, 8) ?? '?'}`, subtitle: t.task_type, time: timeAgo(t.created_at), borderColor: t.priority === 'high' ? 'border-l-[#FF8A00]' : 'border-l-secondary', dotColor: t.priority === 'high' ? 'bg-[#FF8A00]' : undefined,
        })),
        ...maintenance.slice(0, 2).map(t => ({
          id: t.id, icon: ClipboardList, title: t.issue_description?.slice(0, 30) ?? 'Maintenance', subtitle: t.status, time: timeAgo(t.created_at), borderColor: 'border-l-muted-foreground',
        })),
      ];
      setTasks(taskList.length > 0 ? taskList : [
        { id: 'placeholder', icon: CheckCircle, title: 'No pending tasks', subtitle: 'All caught up', time: '', borderColor: 'border-l-secondary' },
      ]);

      const eventActivities: ActivityItem[] = ((eventsRes.data ?? []) as { id: string; event_type: string; entity_type: string; entity_id: string; payload: Record<string, unknown>; created_at: string }[]).slice(0, 5).map(e => {
        const isHighPriority = e.event_type?.includes('ERROR') || e.event_type?.includes('FAILED');
        return {
          id: e.id,
          icon: isHighPriority ? Bell : CheckCircle,
          iconColor: isHighPriority ? 'text-destructive' : 'text-secondary',
          text: `${e.event_type} ${e.entity_type ? `- ${e.entity_type} ${e.entity_id ?? ''}` : ''}`.trim(),
          time: timeAgo(e.created_at),
          priority: isHighPriority ? 'High Priority' : undefined,
        };
      });
      setActivities(eventActivities.length > 0 ? eventActivities : [
        { id: 'empty', icon: CheckCircle, iconColor: 'text-secondary', text: 'No recent activity', time: '' },
      ]);

      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#0F1115] text-on-surface font-body-md relative pb-32">
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-[44px] bg-background/80 backdrop-blur-xl border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <img src={logoSrc} alt="Highlands Cafe & Motel Inn" className="h-5 w-5 rounded-full object-cover" />
          <span className="text-sm font-black text-on-surface">Highlands Cafe & Motel Inn</span>
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
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <section className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border-l-4 border-primary p-4 flex flex-col justify-between h-32" style={{ background: 'rgba(32, 31, 31, 0.6)', backdropFilter: 'blur(20px)' }}>
              <span className="text-xs font-semibold text-on-surface-variant tracking-wider">ROOMS READY</span>
              <div className="flex items-end justify-between">
                <span className="text-5xl font-bold leading-none text-on-surface">{cleanedRooms}<span className="text-sm font-medium text-on-surface-variant ml-1">/{totalRooms}</span></span>
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="rounded-xl border-l-4 border-secondary p-4 flex flex-col justify-between h-32" style={{ background: 'rgba(32, 31, 31, 0.6)', backdropFilter: 'blur(20px)' }}>
              <span className="text-xs font-semibold text-on-surface-variant tracking-wider">PENDING TASKS</span>
              <div className="flex items-end justify-between">
                <span className="text-5xl font-bold leading-none text-on-surface">{String(pendingTasks).padStart(2, '0')}</span>
                <Clock className="h-6 w-6 text-secondary" />
              </div>
            </div>
          </section>
        )}

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
                <div key={task.id} className="relative group" onClick={() => task.id !== 'placeholder' ? navigate('/motel') : undefined}>
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
                    {task.time && (
                      <div className="text-right">
                        <p className="text-sm text-on-surface">{task.time}</p>
                        <ChevronRight className="h-4 w-4 text-on-surface-variant opacity-50 ml-auto" />
                      </div>
                    )}
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
                    {a.time && (
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {a.time}{a.priority && ` • ${a.priority}`}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-outline-variant/10 safe-area-bottom">
        <div className="flex items-center justify-around h-20 px-6">
          {([
            { label: 'Operations', href: '/dashboard', icon: ChefHat, fab: false },
            { label: 'Rooms', href: '/motel', icon: Bed, fab: false },
            { label: 'Scan', href: '/pos', icon: Scan, fab: true },
            { label: 'KDS', href: '/kitchen', icon: UtensilsCrossed, fab: false },
            { label: 'Analytics', href: '/analytics', icon: ClipboardList, fab: false },
          ] as const).map((item) => {
            const active = location.pathname === item.href;
            if (item.fab) {
              return (
                <button key={item.href} onClick={() => navigate(item.href)} className="-mt-6 flex items-center justify-center">
                  <div className={cn(
                    'w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-transform',
                    active ? 'bg-primary text-on-primary ring-4 ring-primary/20' : 'bg-primary text-on-primary'
                  )}>
                    <item.icon className="h-7 w-7" />
                  </div>
                </button>
              );
            }
            return (
              <button
                key={item.href}
                onClick={() => navigate(item.href)}
                className={cn(
                  'flex flex-col items-center gap-1 transition-all duration-150',
                  active ? 'text-primary' : 'text-on-surface-variant opacity-60'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-semibold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 pointer-events-none opacity-40">
        <span className="text-xs text-on-surface-variant">SWIPE LEFT TO COMPLETE</span>
      </div>
    </div>
  );
}
