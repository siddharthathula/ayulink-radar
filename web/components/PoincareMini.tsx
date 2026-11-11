"use client";

interface Props {
  rr: number[];
  width?: number;
  height?: number;
}

/** Small Poincare plot: RR[i] on x, RR[i+1] on y. Pure SVG, no chart library. */
export function PoincareMini({ rr, width = 190, height = 150 }: Props) {
  const pad = 16;
  const values = rr.slice(0, -1).concat(rr.slice(1));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);

  const x = (value: number) => pad + ((value - min) / span) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full max-w-[220px]"
      role="img"
      aria-label="Poincare plot of consecutive RR intervals"
    >
      <rect
        x={pad}
        y={pad}
        width={width - pad * 2}
        height={height - pad * 2}
        fill="none"
        stroke="var(--border)"
      />
      <line
        x1={x(min)}
        y1={y(min)}
        x2={x(max)}
        y2={y(max)}
        stroke="var(--border)"
        strokeDasharray="3 4"
      />
      {rr.slice(0, -1).map((value, index) => (
        <circle
          key={index}
          cx={x(value)}
          cy={y(rr[index + 1])}
          r={2.6}
          fill="var(--rhythm)"
          fillOpacity={0.75}
        />
      ))}
      <text x={pad} y={height - 3} fontSize={9} fill="var(--muted)">
        RR[i] (ms)
      </text>
      <text x={width - pad} y={height - 3} fontSize={9} fill="var(--muted)" textAnchor="end">
        {min}–{max}
      </text>
    </svg>
  );
}
