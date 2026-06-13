import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatNumber } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: number | string;
  format?: 'number' | 'currency' | 'percent' | 'raw';
  change?: number;
  hint?: string;
  testId?: string;
  className?: string;
}

const formatMap = {
  number: formatNumber,
  currency: (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v),
  percent: (v: number) => `${v.toFixed(1)}%`,
  raw: (v: number | string) => String(v),
};

export function KpiCard({ title, value, format = 'number', change, hint, testId, className }: KpiCardProps) {
  const formatter = formatMap[format];
  const display = typeof value === 'number' ? formatter(value) : value;
  const Trend = change === undefined ? null : change > 0 ? ArrowUp : change < 0 ? ArrowDown : Minus;
  return (
    <Card className={cn('transition-shadow hover:shadow-md', className)} data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight" data-testid={`${testId}-value`}>
          {display}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          {change !== undefined && Trend && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium',
                change > 0 && 'bg-success/15 text-success',
                change < 0 && 'bg-destructive/15 text-destructive',
                change === 0 && 'bg-muted text-muted-foreground',
              )}
            >
              <Trend className="h-3 w-3" />
              {Math.abs(change).toFixed(1)}%
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
