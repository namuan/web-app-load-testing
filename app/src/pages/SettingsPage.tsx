import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useThemeStore } from '@/stores';
import { useToast } from '@/components/ui/toaster';
import { Input } from '@/components/ui/input';

interface AppSettings {
  theme?: string;
  language?: string;
  timezone?: string;
  notifications?: { email: boolean; push: boolean; sms: boolean; inApp: boolean };
  privacy?: { shareAnalytics: boolean; shareUsageData: boolean };
  display?: { density: string; sidebarCollapsed: boolean; showAvatars: boolean };
  shortcuts?: Record<string, string>;
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (partial: AppSettings) => api.putSettings(partial as unknown as Record<string, unknown>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast({ title: 'Settings saved' });
    },
  });

  useEffect(() => {
    if (data?.theme && typeof data.theme === 'string') {
      setTheme(data.theme as 'light' | 'dark' | 'system');
    }
  }, [data?.theme, setTheme]);

  if (isLoading || !data) {
    return <Skeleton className="h-96" />;
  }

  const s = data as AppSettings;
  const update = (partial: AppSettings) => mutation.mutate(partial);

  return (
    <div className="grid gap-6" data-testid="settings-page">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Changes persist locally (this is a mock — no real backend writes).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Theme, density, and display options.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Theme</Label>
            <Select value={theme} onValueChange={(v) => { setTheme(v as 'light' | 'dark' | 'system'); update({ theme: v }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Density</Label>
            <Select defaultValue={s.display?.density} onValueChange={(v) => update({ display: { ...(s.display ?? { density: 'comfortable', sidebarCollapsed: false, showAvatars: true }), density: v } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Toggle
            label="Show avatars"
            description="Display user avatars in tables."
            checked={s.display?.showAvatars ?? true}
            onCheckedChange={(v) =>
              update({
                display: {
                  ...(s.display ?? { density: 'comfortable', sidebarCollapsed: false, showAvatars: true }),
                  showAvatars: v,
                },
              })
            }
          />
          <Toggle
            label="Collapse sidebar by default"
            description="Start with a collapsed sidebar on small screens."
            checked={s.display?.sidebarCollapsed ?? false}
            onCheckedChange={(v) =>
              update({
                display: {
                  ...(s.display ?? { density: 'comfortable', sidebarCollapsed: false, showAvatars: true }),
                  sidebarCollapsed: v,
                },
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Choose how you want to be notified.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Toggle
            label="Email"
            description="Receive product and account emails."
            checked={s.notifications?.email ?? true}
            onCheckedChange={(v) =>
              update({
                notifications: { ...(s.notifications ?? { email: false, push: false, sms: false, inApp: false }), email: v },
              })
            }
          />
          <Toggle
            label="Push"
            description="Browser push notifications."
            checked={s.notifications?.push ?? false}
            onCheckedChange={(v) =>
              update({
                notifications: { ...(s.notifications ?? { email: false, push: false, sms: false, inApp: false }), push: v },
              })
            }
          />
          <Toggle
            label="SMS"
            description="Critical alerts by SMS."
            checked={s.notifications?.sms ?? false}
            onCheckedChange={(v) =>
              update({
                notifications: { ...(s.notifications ?? { email: false, push: false, sms: false, inApp: false }), sms: v },
              })
            }
          />
          <Toggle
            label="In-app"
            description="In-app banners and badges."
            checked={s.notifications?.inApp ?? true}
            onCheckedChange={(v) =>
              update({
                notifications: { ...(s.notifications ?? { email: false, push: false, sms: false, inApp: false }), inApp: v },
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
          <CardDescription>Decide what data you share with us.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Toggle
            label="Share analytics"
            description="Anonymous usage analytics."
            checked={s.privacy?.shareAnalytics ?? false}
            onCheckedChange={(v) =>
              update({
                privacy: { ...(s.privacy ?? { shareAnalytics: false, shareUsageData: false }), shareAnalytics: v },
              })
            }
          />
          <Toggle
            label="Share usage data"
            description="Help us improve by sharing feature usage."
            checked={s.privacy?.shareUsageData ?? false}
            onCheckedChange={(v) =>
              update({
                privacy: { ...(s.privacy ?? { shareAnalytics: false, shareUsageData: false }), shareUsageData: v },
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keyboard shortcuts</CardTitle>
          <CardDescription>Personalize how you trigger global actions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1">
            <Label>Open search</Label>
            <Input defaultValue={s.shortcuts?.openSearch} />
          </div>
          <div className="grid gap-1">
            <Label>Toggle theme</Label>
            <Input defaultValue={s.shortcuts?.toggleTheme} />
          </div>
          <div className="grid gap-1">
            <Label>Notifications</Label>
            <Input defaultValue={s.shortcuts?.openNotifications} />
          </div>
        </CardContent>
        <CardContent>
          <Button onClick={() => toast({ title: 'Shortcuts saved' })}>Save shortcuts</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-4">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}
