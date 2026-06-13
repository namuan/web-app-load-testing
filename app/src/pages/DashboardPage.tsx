import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { KpiCard } from '@/components/KpiCard';
import { LineChart } from '@/components/charts/LineChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { Activity, AlertCircle, CheckCircle2, ShoppingCart, Users } from 'lucide-react';
import { formatCurrency, formatNumber, formatDateTime, relativeTime } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { useNotificationStore } from '@/stores';

const PALETTE = ['#0ea5e9', '#22c55e', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4'];

export default function DashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboard,
  });
  const { data: analytics } = useQuery({ queryKey: ['analytics'], queryFn: api.getAnalytics });
  const { toast } = useToast();
  const pushNotification = useNotificationStore((s) => s.push);

  const channelData = useMemo(
    () => (analytics?.channels ?? []).map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length] })),
    [analytics],
  );

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load dashboard</CardTitle>
          <CardDescription>The mock API did not respond. Make sure it is running.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="grid gap-6" data-testid="dashboard-page">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot of your business at {formatDateTime(new Date().toISOString())}.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total users"
          value={data.kpis.totalUsers}
          change={data.growth.users}
          hint="vs. last period"
          testId="kpi-total-users"
        />
        <KpiCard
          title="Active users"
          value={data.kpis.activeUsers}
          change={data.growth.users}
          hint="signed in this week"
          testId="kpi-active-users"
        />
        <KpiCard
          title="Revenue"
          value={data.kpis.revenue}
          format="currency"
          change={data.growth.revenue}
          hint="gross, before refunds"
          testId="kpi-revenue"
        />
        <KpiCard
          title="Conversion"
          value={data.kpis.conversionRate}
          format="percent"
          change={2.1}
          hint="visitor → customer"
          testId="kpi-conversion"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Revenue trend</CardTitle>
              <CardDescription>Last 30 days</CardDescription>
            </div>
            <Badge variant="success">{data.growth.revenue.toFixed(1)}%</Badge>
          </CardHeader>
          <CardContent>
            <LineChart
              data={(analytics?.timeseries ?? []).map((t) => ({ x: t.date.slice(5), y: t.revenue }))}
              yLabel="Revenue"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acquisition channels</CardTitle>
            <CardDescription>Share of sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={channelData.map((c) => ({ label: c.name, value: c.sessions, color: c.color }))}
              centerLabel="sessions"
              centerValue={formatNumber(analytics?.summary.sessions ?? 0)}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top products</CardTitle>
            <CardDescription>By revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.topProducts.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatNumber(p.units)} units · ID {p.id}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-medium">{formatCurrency(p.revenue)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System health</CardTitle>
            <CardDescription>Local mock services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <HealthRow label="API" status={data.systemHealth.api} />
            <HealthRow label="Web" status={data.systemHealth.web} />
            <HealthRow label="DB" status={data.systemHealth.db} />
            <HealthRow label="CDN" status={data.systemHealth.cdn} />
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              Last incident: {formatDateTime(data.systemHealth.lastIncident)}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                pushNotification({ type: 'info', title: 'Health check', body: 'All systems nominal.' });
                toast({ title: 'Health check', description: 'All systems nominal.' });
              }}
            >
              Run health check
            </Button>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Live event stream</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.recentActivity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-3 text-sm">
                  {iconFor(a.type)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span className="font-medium">{a.user}</span> · {a.type.replace('_', ' ')}
                      {a.amount !== undefined && <> · {formatCurrency(a.amount)}</>}
                    </p>
                    <p className="text-xs text-muted-foreground">{relativeTime(a.at)}</p>
                  </div>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function HealthRow({ label, status }: { label: string; status: string }) {
  const ok = status === 'operational';
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span className="inline-flex items-center gap-1.5">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <AlertCircle className="h-4 w-4 text-warning" />
        )}
        <span className="capitalize text-muted-foreground">{status}</span>
      </span>
    </div>
  );
}

function iconFor(type: string) {
  if (type === 'purchase') return <ShoppingCart className="h-4 w-4 text-primary" />;
  if (type === 'signup') return <Users className="h-4 w-4 text-success" />;
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}
