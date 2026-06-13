import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { KpiCard } from '@/components/KpiCard';
import { LineChart } from '@/components/charts/LineChart';
import { BarChart } from '@/components/charts/BarChart';
import { formatCurrency, formatNumber } from '@/lib/utils';

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['analytics'], queryFn: api.getAnalytics });
  const [metric, setMetric] = useState<'pageViews' | 'sessions' | 'signups' | 'revenue'>('pageViews');

  const tsData = useMemo(
    () => (data?.timeseries ?? []).map((t) => ({ x: t.date.slice(5), y: t[metric] as number })),
    [data, metric],
  );

  if (isLoading || !data) {
    return (
      <div className="grid gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="grid gap-6" data-testid="analytics-page">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">All metrics computed from the local mock API.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Page views" value={data.summary.pageViews} hint="30 days" />
        <KpiCard title="Sessions" value={data.summary.sessions} hint="unique" />
        <KpiCard title="Bounce rate" value={data.summary.bounceRate} format="percent" />
        <KpiCard
          title="Avg. session"
          value={`${Math.floor(data.summary.avgSessionDurationSec / 60)}m ${
            data.summary.avgSessionDurationSec % 60
          }s`}
          format="raw"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Time series</CardTitle>
          <CardDescription>Daily breakdown for the last 30 days.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as typeof metric)}>
            <TabsList>
              <TabsTrigger value="pageViews">Page views</TabsTrigger>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
              <TabsTrigger value="signups">Signups</TabsTrigger>
              <TabsTrigger value="revenue">Revenue</TabsTrigger>
            </TabsList>
            <TabsContent value={metric}>
              <LineChart data={tsData} height={280} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Channel performance</CardTitle>
            <CardDescription>Sessions and conversions by acquisition channel.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={data.channels.map((c) => ({ label: c.name, value: c.sessions }))}
              height={260}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversions</CardTitle>
            <CardDescription>Goal completions per channel</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.channels.map((c) => (
                <li key={c.name} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.sharePct.toFixed(1)}% share</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono">{formatNumber(c.conversions)}</p>
                    <p className="text-xs text-muted-foreground">
                      CR {((c.conversions / c.sessions) * 100).toFixed(1)}%
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Revenue by day</CardTitle>
          <CardDescription>Top 10 revenue days</CardDescription>
        </CardHeader>
        <CardContent>
          <BarChart
            data={[...data.timeseries]
              .sort((a, b) => b.revenue - a.revenue)
              .slice(0, 10)
              .map((t) => ({ label: t.date.slice(5), value: Math.round(t.revenue) }))}
            height={240}
          />
          <p className="mt-2 text-right text-xs text-muted-foreground">
            Total: {formatCurrency(data.timeseries.reduce((s, t) => s + t.revenue, 0))}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
