import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutDatum[];
  size?: number;
  className?: string;
  centerLabel?: string;
  centerValue?: string;
}

export function DonutChart({ data, size = 220, className, centerLabel, centerValue }: DonutChartProps) {
  const slices = useMemo(() => {
    const total = data.reduce((acc, d) => acc + d.value, 0) || 1;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;
    const inner = r * 0.6;
    let angle = -Math.PI / 2;
    return data.map((d) => {
      const slice = (d.value / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(angle + slice);
      const y2 = cy + r * Math.sin(angle + slice);
      const ix1 = cx + inner * Math.cos(angle + slice);
      const iy1 = cy + inner * Math.sin(angle + slice);
      const ix2 = cx + inner * Math.cos(angle);
      const iy2 = cy + inner * Math.sin(angle);
      const large = slice > Math.PI ? 1 : 0;
      const path = [
        `M ${x1} ${y1}`,
        `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
        `L ${ix1} ${iy1}`,
        `A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2}`,
        'Z',
      ].join(' ');
      angle += slice;
      return { ...d, path, pct: (d.value / total) * 100 };
    });
  }, [data, size]);

  if (data.length === 0) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">No data</div>;
  }

  return (
    <div className={cn('flex items-center gap-6', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Donut chart">
        {slices.map((s) => (
          <path key={s.label} d={s.path} fill={s.color}>
            <title>
              {s.label}: {s.value} ({s.pct.toFixed(1)}%)
            </title>
          </path>
        ))}
        {centerValue && (
          <text
            x={size / 2}
            y={size / 2 - 4}
            textAnchor="middle"
            fontSize="22"
            fontWeight="700"
            className="fill-foreground"
          >
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text
            x={size / 2}
            y={size / 2 + 18}
            textAnchor="middle"
            fontSize="12"
            className="fill-muted-foreground"
          >
            {centerLabel}
          </text>
        )}
      </svg>
      <ul className="space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ background: s.color }}
              aria-hidden
            />
            <span className="font-medium">{s.label}</span>
            <span className="text-muted-foreground">{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
