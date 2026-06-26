import { useState, useEffect } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import { Save, Bell, Shield, Globe, Loader2 } from 'lucide-react';
import { insforge } from '../../lib/core/insforge';
import { useAuth } from '../../lib/core/auth-context';

const DEFAULT_SETTINGS = {
  business_name: 'Highlands Cafe & Motel Inn',
  currency: 'NPR',
  notifications: {
    new_orders: true,
    kitchen_alerts: true,
    payment_received: true,
    low_stock_warnings: true,
    checkin_reminders: true,
  },
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [businessName, setBusinessName] = useState(DEFAULT_SETTINGS.business_name);
  const [currency, setCurrency] = useState(DEFAULT_SETTINGS.currency);
  const [notifications, setNotifications] = useState(DEFAULT_SETTINGS.notifications);

  useEffect(() => {
    (async () => {
      const { data, error } = await insforge.database
        .from('system_settings')
        .select('key, value')
        .in('key', ['business_name', 'currency', 'notifications']);
      if (!error && data) {
        for (const row of data as { key: string; value: Record<string, unknown> }[]) {
          if (row.key === 'business_name' && typeof row.value?.business_name === 'string') setBusinessName(row.value.business_name);
          if (row.key === 'currency' && typeof row.value?.currency === 'string') setCurrency(row.value.currency);
          if (row.key === 'notifications' && row.value) setNotifications({ ...DEFAULT_SETTINGS.notifications, ...row.value });
        }
      }
      setLoading(false);
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    const userId = user?.id || null;
    const upsert = async (key: string, value: Record<string, unknown>) => {
      const { data: existing } = await insforge.database.from('system_settings').select('id').eq('key', key).limit(1);
      const row = { key, value, updated_by: userId, updated_at: new Date().toISOString() };
      if (existing && existing.length > 0) {
        await insforge.database.from('system_settings').update(row).eq('key', key);
      } else {
        await insforge.database.from('system_settings').insert([row]);
      }
    };
    await Promise.all([
      upsert('business_name', { business_name: businessName }),
      upsert('currency', { currency }),
      upsert('notifications', notifications as unknown as Record<string, unknown>),
    ]);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">System preferences, roles, and integrations</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">General Settings</h3>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="name">Business Name</Label>
              <Input id="name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="max-w-[120px]" />
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Role Permissions</h3>
            </div>
            <Separator />
            {['Admin', 'Manager', 'Staff', 'Kitchen', 'Reception'].map((role) => (
              <div key={role} className="flex items-center justify-between">
                <span className="text-sm">{role}</span>
                <span className="text-xs text-muted-foreground">{role === 'Admin' ? 'Full access' : 'Limited access'}</span>
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4 space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Notification Preferences</h3>
            </div>
            <Separator />
            {[
              { key: 'new_orders' as const, label: 'New Orders', desc: 'Alert when a new order is placed' },
              { key: 'kitchen_alerts' as const, label: 'Kitchen Alerts', desc: 'Sound alert for kitchen display' },
              { key: 'payment_received' as const, label: 'Payment Received', desc: 'Notify on successful payment' },
              { key: 'low_stock_warnings' as const, label: 'Low Stock Warnings', desc: 'Alert when stock runs low' },
              { key: 'checkin_reminders' as const, label: 'Check-in Reminders', desc: 'Remind for upcoming check-ins' },
            ].map((n) => (
              <div key={n.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{n.label}</p>
                  <p className="text-xs text-muted-foreground">{n.desc}</p>
                </div>
                <Switch checked={notifications[n.key]} onCheckedChange={(checked) => setNotifications({ ...notifications, [n.key]: checked })} />
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4 space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Integrations</h3>
            </div>
            <Separator />
            {[
              { name: 'Print Node', desc: 'Receipt printer integration', connected: true },
              { name: 'Sentry', desc: 'Error monitoring', connected: true },
              { name: 'Email Service', desc: 'Invoice and booking emails', connected: false },
              { name: 'SMS Gateway', desc: 'Customer notifications', connected: false },
            ].map((int) => (
              <div key={int.name} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{int.name}</p>
                  <p className="text-xs text-muted-foreground">{int.desc}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${int.connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                  {int.connected ? 'Connected' : 'Not Connected'}
                </span>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || saved}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
