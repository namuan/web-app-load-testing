import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface LineChartProps {
  data: Array<{ x: string; y: number }>;
  height?: number;
  className?: string;
  yLabel?: string;
}

export function LineChart({ data, height = 220, className, yLabel }: LineChartProps) {
  const { path, area, ticks, xLabels } = useMemo(() => {
    if (data.length === 0) {
      return { path: '', area: '', ticks: [], xLabels: [] };
    }
    const W = 600;
    const H = height;
    const P = 36;
    const minY = Math.min(...data.map((d) => d.y));
    const maxY = Math.max(...data.map((d) => d.y));
    const range = maxY - minY || 1;
    const stepX = data.length > 1 ? (W - P * 2) / (data.length - 1) : 0;
    const points = data.map((d, i) => {
      const x = P + i * stepX;
      const y = H - P - ((d.y - minY) / range) * (H - P * 2);
      return { x, y, label: d.x, value: d.y };
    });
    const path = points
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');
    const area = `${path} L ${points[points.length - 1].x} ${H - P} L ${points[0].x} ${H - P} Z`;

    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
      const v = minY + (range * i) / tickCount;
      return {
        value: v,
        y: H - P - ((v - minY) / range) * (H - P * 2),
      };
    });
    const xLabels = points.filter((_, i) => i % Math.ceil(points.length / 6) === 0);

    return { path, area, ticks, xLabels };
  }, [data, height]);

  if (data.length === 0) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">No data</div>;
  }

  return (
    <div className={cn('relative w-full', className)}>
      <svg
        viewBox={`0 0 600 ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={yLabel ?? 'Line chart'}
      >
        <defs>
          <linearGradient id="line-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <line
            key={i}
            x1="36"
            x2="564"
            y1={t.y}
            y2={t.y}
            stroke="hsl(var(--border))"
            strokeDasharray="2 4"
          />
        ))}
        <path d={area} fill="url(#line-gradient)" />
        <path
          d={path}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {xLabels.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={height - 12}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
          >
            {p.label}
          </text>
        ))}
        {ticks.map((t, i) => (
          <text
            key={`yt-${i}`}
            x={28}
            y={t.y + 3}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize="10"
          >
            {Math.round(t.value).toLocaleString()}
          </text>
        ))}
      </svg>
    </div>
  );
}
