import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  className?: string;
}

export function BarChart({ data, height = 220, className }: BarChartProps) {
  const { max, width, gap, barW, P, H } = useMemo(() => {
    const W = 600;
    const P = 32;
    const H = height;
    const max = Math.max(1, ...data.map((d) => d.value));
    const gap = 12;
    const barW = data.length > 0 ? (W - P * 2 - gap * (data.length - 1)) / data.length : 0;
    return { max, width: W, gap, barW, P, H };
  }, [data, height]);

  if (data.length === 0) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">No data</div>;
  }

  return (
    <div className={cn('relative w-full', className)}>
      <svg viewBox={`0 0 ${width} ${H}`} className="w-full" role="img" aria-label="Bar chart">
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line
            key={i}
            x1={P}
            x2={width - P}
            y1={H - P - (H - P * 2) * p}
            y2={H - P - (H - P * 2) * p}
            stroke="hsl(var(--border))"
            strokeDasharray="2 4"
          />
        ))}
        {data.map((d, i) => {
          const h = ((d.value / max) * (H - P * 2)) | 0;
          const x = P + i * (barW + gap);
          const y = H - P - h;
          return (
            <g key={d.label}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx="4"
                fill={d.color ?? 'hsl(var(--primary))'}
                opacity="0.85"
              >
                <title>
                  {d.label}: {d.value.toLocaleString()}
                </title>
              </rect>
              <text
                x={x + barW / 2}
                y={H - 10}
                textAnchor="middle"
                fontSize="10"
                className="fill-muted-foreground"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
