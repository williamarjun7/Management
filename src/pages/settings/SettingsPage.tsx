import { useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import { Save, Bell, Shield, Globe } from 'lucide-react';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
              <Input id="name" defaultValue="Highlands Cafe & Motel Inn" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" defaultValue="NPR" className="max-w-[120px]" />
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
              { label: 'New Orders', desc: 'Alert when a new order is placed' },
              { label: 'Kitchen Alerts', desc: 'Sound alert for kitchen display' },
              { label: 'Payment Received', desc: 'Notify on successful payment' },
              { label: 'Low Stock Warnings', desc: 'Alert when stock runs low' },
              { label: 'Check-in Reminders', desc: 'Remind for upcoming check-ins' },
            ].map((n) => (
              <div key={n.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{n.label}</p>
                  <p className="text-xs text-muted-foreground">{n.desc}</p>
                </div>
                <Switch defaultChecked onCheckedChange={(checked) => console.log(`${n.label}: ${checked}`)} />
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
        <Button onClick={handleSave} disabled={saved}>
          <Save className="mr-2 h-4 w-4" />
          {saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
