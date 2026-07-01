import { useState, useEffect } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Select } from '../../components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import {
  Save, Bell, Globe, Palette, Sun, Moon, Loader2,
  ShoppingCart, Receipt, Hotel, CookingPot, Lock, Users,
  Clock, Printer, Percent, DollarSign, KeyRound,
  Smartphone, Download,
} from 'lucide-react';
import { insforge } from '../../lib/core/insforge';
import { useAuth } from '../../lib/core/auth-context';
import { useTheme } from '../../lib/core/theme-context';
import { getCurrentAppVersion } from '../../lib/services/app-update';
import { useUpdate } from '../../lib/core/update-context';
import ColorPicker from '../../components/ColorPicker';

const ALL_ROLES = ['admin', 'manager', 'staff', 'kitchen', 'reception'] as const;

const ALL_MODULES = [
  'Dashboard', 'POS', 'Orders', 'Kitchen', 'Menu', 'Inventory',
  'Billing', 'Motel', 'Reports', 'Analytics', 'Settings', 'Staff',
] as const;

type Role = typeof ALL_ROLES[number];
type Module = typeof ALL_MODULES[number];

const MODULE_ACCESS: Record<Role, Module[]> = {
  admin: [...ALL_MODULES],
  manager: ALL_MODULES.filter((m) => !['Analytics', 'Settings', 'Staff'].includes(m)),
  staff: ALL_MODULES.filter((m) => ['Dashboard', 'POS', 'Orders', 'Menu', 'Inventory', 'Billing'].includes(m)),
  kitchen: ['Kitchen', 'Orders'],
  reception: ['Dashboard', 'Billing', 'Motel', 'Orders'],
};

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
  pos: {
    default_payment_method: 'cash',
    auto_print_receipt: true,
    auto_print_kitchen: true,
    printer_ip: '',
    printer_port: 9100,
  },
  billing: {
    invoice_prefix: 'INV-',
    default_due_days: 7,
    tax_rate: 13,
    service_charge_percent: 10,
  },
  motel: {
    check_in_time: '14:00',
    check_out_time: '12:00',
    default_nightly_rate: 0,
    auto_clean_after_checkout: true,
  },
  kitchen: {
    default_prep_time_minutes: 15,
    display_mode: 'grid',
    sound_on_new_order: true,
  },
  security: {
    session_timeout_minutes: 480,
    min_password_length: 8,
    require_special_char: false,
  },
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme, resetTheme } = useTheme();
  const { updateInfo, updateAvailable } = useUpdate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [businessName, setBusinessName] = useState(DEFAULT_SETTINGS.business_name);
  const [currency, setCurrency] = useState(DEFAULT_SETTINGS.currency);
  const [notifications, setNotifications] = useState(DEFAULT_SETTINGS.notifications);
  const [pos, setPos] = useState(DEFAULT_SETTINGS.pos);
  const [billing, setBilling] = useState(DEFAULT_SETTINGS.billing);
  const [motel, setMotel] = useState(DEFAULT_SETTINGS.motel);
  const [kitchen, setKitchen] = useState(DEFAULT_SETTINGS.kitchen);
  const [security, setSecurity] = useState(DEFAULT_SETTINGS.security);

  const [rolePerms, setRolePerms] = useState(() => {
    const perms: Record<string, Record<string, boolean>> = {};
    for (const role of ALL_ROLES) {
      perms[role] = {};
      for (const mod of ALL_MODULES) {
        perms[role][mod] = MODULE_ACCESS[role].includes(mod);
      }
    }
    return perms;
  });

  useEffect(() => {
    (async () => {
      const keys = [
        'business_name', 'currency', 'notifications', 'pos', 'billing',
        'motel', 'kitchen', 'security', 'role_permissions',
      ];
      const { data, error } = await insforge.database
        .from('system_settings')
        .select('key, value')
        .in('key', keys);
      if (!error && data) {
        for (const row of data as { key: string; value: Record<string, unknown> }[]) {
          if (row.key === 'business_name' && typeof row.value?.business_name === 'string') setBusinessName(row.value.business_name);
          if (row.key === 'currency' && typeof row.value?.currency === 'string') setCurrency(row.value.currency);
          if (row.key === 'notifications' && row.value) setNotifications({ ...DEFAULT_SETTINGS.notifications, ...row.value });
          if (row.key === 'pos' && row.value) setPos({ ...DEFAULT_SETTINGS.pos, ...row.value });
          if (row.key === 'billing' && row.value) setBilling({ ...DEFAULT_SETTINGS.billing, ...row.value });
          if (row.key === 'motel' && row.value) setMotel({ ...DEFAULT_SETTINGS.motel, ...row.value });
          if (row.key === 'kitchen' && row.value) setKitchen({ ...DEFAULT_SETTINGS.kitchen, ...row.value });
          if (row.key === 'security' && row.value) setSecurity({ ...DEFAULT_SETTINGS.security, ...row.value });
          if (row.key === 'role_permissions' && row.value) {
            setRolePerms((prev) => {
              const merged = { ...prev };
              for (const role of ALL_ROLES) {
                const saved = row.value[role] as Record<string, boolean> | undefined;
                if (saved) merged[role] = { ...merged[role], ...saved };
              }
              return merged;
            });
          }
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
      upsert('pos', pos as unknown as Record<string, unknown>),
      upsert('billing', billing as unknown as Record<string, unknown>),
      upsert('motel', motel as unknown as Record<string, unknown>),
      upsert('kitchen', kitchen as unknown as Record<string, unknown>),
      upsert('security', security as unknown as Record<string, unknown>),
      upsert('role_permissions', rolePerms as unknown as Record<string, unknown>),
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
    <div className="space-y-6 max-w-4xl border-t-4 border-t-gray-500 pt-4">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">System preferences, roles, and integrations</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="pos">POS</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="motel">Motel</TabsTrigger>
          <TabsTrigger value="kitchen">Kitchen</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
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
        </TabsContent>

        <TabsContent value="appearance" className="mt-4 space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Sun className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Theme Mode</h3>
            </div>
            <Separator />
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('light')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                  theme === 'light'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <Sun className="h-4 w-4" /> Light
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                  theme === 'dark'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <Moon className="h-4 w-4" /> Dark
              </button>
            </div>
          </Card>
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Accent Color</h3>
            </div>
            <Separator />
            <ColorPicker />
          </Card>
          <div className="flex justify-end">
            <Button variant="outline" onClick={resetTheme}>Reset to Defaults</Button>
          </div>
        </TabsContent>

        <TabsContent value="pos" className="mt-4 space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">POS Settings</h3>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Default Payment Method</Label>
              <Select
                value={pos.default_payment_method}
                onChange={(e) => setPos({ ...pos, default_payment_method: e.target.value })}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'fonepay', label: 'FonePay' },
                  { value: 'credit_account', label: 'Credit Account' },
                ]}
                className="max-w-[200px]"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-print Receipt</p>
                <p className="text-xs text-muted-foreground">Print receipt after each sale</p>
              </div>
              <Switch checked={pos.auto_print_receipt} onCheckedChange={(v) => setPos({ ...pos, auto_print_receipt: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-print Kitchen Order</p>
                <p className="text-xs text-muted-foreground">Send order to kitchen printer automatically</p>
              </div>
              <Switch checked={pos.auto_print_kitchen} onCheckedChange={(v) => setPos({ ...pos, auto_print_kitchen: v })} />
            </div>
            <div className="flex items-center gap-3">
              <Printer className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 space-y-2">
                <Label>Printer IP</Label>
                <Input value={pos.printer_ip} onChange={(e) => setPos({ ...pos, printer_ip: e.target.value })} placeholder="192.168.1.100" className="max-w-[200px]" />
              </div>
              <div className="space-y-2 w-24">
                <Label>Port</Label>
                <Input type="number" value={pos.printer_port} onChange={(e) => setPos({ ...pos, printer_port: Number(e.target.value) })} />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-4 space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Billing Settings</h3>
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice Prefix</Label>
                <Input value={billing.invoice_prefix} onChange={(e) => setBilling({ ...billing, invoice_prefix: e.target.value })} className="max-w-[140px]" />
              </div>
              <div className="space-y-2">
                <Label>Default Due (days)</Label>
                <Input type="number" value={billing.default_due_days} onChange={(e) => setBilling({ ...billing, default_due_days: Number(e.target.value) })} className="max-w-[120px]" />
              </div>
              <div className="space-y-2">
                <Label><span className="flex items-center gap-1">Tax Rate <Percent className="h-3 w-3" /></span></Label>
                <Input type="number" value={billing.tax_rate} onChange={(e) => setBilling({ ...billing, tax_rate: Number(e.target.value) })} className="max-w-[120px]" />
              </div>
              <div className="space-y-2">
                <Label><span className="flex items-center gap-1">Service Charge <Percent className="h-3 w-3" /></span></Label>
                <Input type="number" value={billing.service_charge_percent} onChange={(e) => setBilling({ ...billing, service_charge_percent: Number(e.target.value) })} className="max-w-[120px]" />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="motel" className="mt-4 space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Hotel className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Motel Settings</h3>
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label><span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Check-in Time</span></Label>
                <Input type="time" value={motel.check_in_time} onChange={(e) => setMotel({ ...motel, check_in_time: e.target.value })} className="max-w-[140px]" />
              </div>
              <div className="space-y-2">
                <Label><span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Check-out Time</span></Label>
                <Input type="time" value={motel.check_out_time} onChange={(e) => setMotel({ ...motel, check_out_time: e.target.value })} className="max-w-[140px]" />
              </div>
              <div className="space-y-2">
                <Label><span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> Default Nightly Rate</span></Label>
                <Input type="number" value={motel.default_nightly_rate} onChange={(e) => setMotel({ ...motel, default_nightly_rate: Number(e.target.value) })} className="max-w-[140px]" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-clean After Checkout</p>
                <p className="text-xs text-muted-foreground">Mark room for cleaning automatically</p>
              </div>
              <Switch checked={motel.auto_clean_after_checkout} onCheckedChange={(v) => setMotel({ ...motel, auto_clean_after_checkout: v })} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="kitchen" className="mt-4 space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CookingPot className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Kitchen Settings</h3>
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label><span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Default Prep Time (min)</span></Label>
                <Input type="number" value={kitchen.default_prep_time_minutes} onChange={(e) => setKitchen({ ...kitchen, default_prep_time_minutes: Number(e.target.value) })} className="max-w-[120px]" />
              </div>
              <div className="space-y-2">
                <Label>Display Mode</Label>
                <Select
                  value={kitchen.display_mode}
                  onChange={(e) => setKitchen({ ...kitchen, display_mode: e.target.value })}
                  options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]}
                  className="max-w-[140px]"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Sound on New Order</p>
                <p className="text-xs text-muted-foreground">Play alert when new order arrives</p>
              </div>
              <Switch checked={kitchen.sound_on_new_order} onCheckedChange={(v) => setKitchen({ ...kitchen, sound_on_new_order: v })} />
            </div>
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

        <TabsContent value="security" className="mt-4 space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Security Settings</h3>
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label><span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Session Timeout (min)</span></Label>
                <Input type="number" value={security.session_timeout_minutes} onChange={(e) => setSecurity({ ...security, session_timeout_minutes: Number(e.target.value) })} className="max-w-[140px]" />
              </div>
              <div className="space-y-2">
                <Label><span className="flex items-center gap-1"><KeyRound className="h-3 w-3" /> Min Password Length</span></Label>
                <Input type="number" value={security.min_password_length} onChange={(e) => setSecurity({ ...security, min_password_length: Number(e.target.value) })} className="max-w-[120px]" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Require Special Character</p>
                <p className="text-xs text-muted-foreground">Enforce special chars in passwords</p>
              </div>
              <Switch checked={security.require_special_char} onCheckedChange={(v) => setSecurity({ ...security, require_special_char: v })} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="mt-4 space-y-4">
          <Card className="p-6 overflow-hidden">
            <div className="p-6 pb-0 flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Role Permissions</h3>
            </div>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Module</th>
                    {ALL_ROLES.map((role) => (
                      <th key={role} className="px-3 py-3 text-center font-medium text-muted-foreground capitalize">{role}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_MODULES.map((mod) => (
                    <tr key={mod} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 text-sm">{mod}</td>
                      {ALL_ROLES.map((role) => (
                        <td key={role} className="px-3 py-2.5 text-center">
                          <Switch
                            checked={rolePerms[role]?.[mod] ?? false}
                            onCheckedChange={(v) =>
                              setRolePerms((prev) => ({
                                ...prev,
                                [role]: { ...prev[role], [mod]: v },
                              }))
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">App Version</p>
              <p className="text-xs text-muted-foreground">Highlands Cafe POS v{getCurrentAppVersion()}</p>
            </div>
          </div>
          <a
            href={updateInfo?.apkUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" /> {updateAvailable ? `v${updateInfo!.latestVersion} Available` : 'Up to date'}
          </a>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || saved}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
