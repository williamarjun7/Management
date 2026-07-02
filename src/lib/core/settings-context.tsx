import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { insforge } from './insforge';
import { setCurrencySymbol } from './format-currency';
import { setSessionDuration } from './auth-context';

export const ALL_ROLES = ['admin', 'manager', 'staff', 'kitchen', 'reception'] as const;
export const ALL_MODULES = [
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

export type SystemSettings = {
  business_name: string;
  currency: string;
  notifications: {
    new_orders: boolean;
    kitchen_alerts: boolean;
    payment_received: boolean;
    low_stock_warnings: boolean;
    checkin_reminders: boolean;
  };
  pos: {
    default_payment_method: string;
    auto_print_receipt: boolean;
    auto_print_kitchen: boolean;
    printer_ip: string;
    printer_port: number;
  };
  billing: {
    invoice_prefix: string;
    default_due_days: number;
    tax_rate: number;
    service_charge_percent: number;
  };
  motel: {
    check_in_time: string;
    check_out_time: string;
    default_nightly_rate: number;
    auto_clean_after_checkout: boolean;
  };
  kitchen: {
    default_prep_time_minutes: number;
    display_mode: string;
    sound_on_new_order: boolean;
  };
  security: {
    session_timeout_minutes: number;
    min_password_length: number;
    require_special_char: boolean;
  };
  role_permissions: Record<string, Record<string, boolean>>;
};

function buildDefaultRolePerms(): Record<string, Record<string, boolean>> {
  const perms: Record<string, Record<string, boolean>> = {};
  for (const role of ALL_ROLES) {
    perms[role] = {};
    for (const mod of ALL_MODULES) {
      perms[role][mod] = MODULE_ACCESS[role].includes(mod as Module);
    }
  }
  return perms;
}

export const DEFAULT_SETTINGS: SystemSettings = {
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
  role_permissions: buildDefaultRolePerms(),
};

const SETTINGS_KEYS: (keyof SystemSettings)[] = [
  'business_name', 'currency', 'notifications', 'pos', 'billing',
  'motel', 'kitchen', 'security', 'role_permissions',
];

interface SettingsContextValue {
  settings: SystemSettings;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  saveSettings: (overrides: Partial<SystemSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function applyRowToSettings(prev: SystemSettings, key: string, value: Record<string, unknown>): SystemSettings {
  switch (key) {
    case 'business_name':
      return { ...prev, business_name: typeof value?.business_name === 'string' ? value.business_name : prev.business_name };
    case 'currency':
      return { ...prev, currency: typeof value?.currency === 'string' ? value.currency : prev.currency };
    case 'notifications':
      return { ...prev, notifications: { ...prev.notifications, ...value } as SystemSettings['notifications'] };
    case 'pos':
      return { ...prev, pos: { ...prev.pos, ...value } as SystemSettings['pos'] };
    case 'billing':
      return { ...prev, billing: { ...prev.billing, ...value } as SystemSettings['billing'] };
    case 'motel':
      return { ...prev, motel: { ...prev.motel, ...value } as SystemSettings['motel'] };
    case 'kitchen':
      return { ...prev, kitchen: { ...prev.kitchen, ...value } as SystemSettings['kitchen'] };
    case 'security':
      return { ...prev, security: { ...prev.security, ...value } as SystemSettings['security'] };
    case 'role_permissions': {
      const merged = { ...prev.role_permissions };
      for (const role of ALL_ROLES) {
        const saved = value[role] as Record<string, boolean> | undefined;
        if (saved) merged[role] = { ...merged[role], ...saved };
      }
      return { ...prev, role_permissions: merged };
    }
    default:
      return prev;
  }
}

function applySettingsSideEffects(settings: SystemSettings) {
  const sym = settings.currency === 'NPR' ? 'Rs.' :
    settings.currency === 'USD' ? '$' :
    settings.currency === 'EUR' ? '€' :
    settings.currency === 'GBP' ? '£' :
    settings.currency === 'INR' ? '₹' :
    settings.currency === 'AUD' ? 'A$' :
    settings.currency === 'CAD' ? 'C$' :
    settings.currency === 'JPY' ? '¥' : `${settings.currency} `;
  setCurrencySymbol(sym);
  setSessionDuration(settings.security.session_timeout_minutes);
  document.title = settings.business_name;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await insforge.database
        .from('system_settings')
        .select('key, value')
        .in('key', SETTINGS_KEYS);
      if (fetchError) throw fetchError;
      if (data) {
        let merged = { ...DEFAULT_SETTINGS };
        for (const row of data as { key: string; value: Record<string, unknown> }[]) {
          merged = applyRowToSettings(merged, row.key, row.value);
        }
        setSettings(merged);
        applySettingsSideEffects(merged);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = useCallback(async (overrides: Partial<SystemSettings>) => {
    const newSettings = { ...settings, ...overrides };
    const upsert = async (key: string, value: Record<string, unknown>) => {
      const { data: existing } = await insforge.database.from('system_settings').select('id').eq('key', key).limit(1);
      const row = { key, value, updated_at: new Date().toISOString() };
      if (existing && existing.length > 0) {
        await insforge.database.from('system_settings').update(row).eq('key', key);
      } else {
        await insforge.database.from('system_settings').insert([row]);
      }
    };
    const promises: Promise<void>[] = [];
    for (const key of SETTINGS_KEYS) {
      const val = overrides[key];
      if (val !== undefined) {
        promises.push(upsert(key, val as Record<string, unknown>));
      }
    }
    await Promise.all(promises);
    setSettings(newSettings);
    applySettingsSideEffects(newSettings);
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, error, refetch: loadSettings, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
