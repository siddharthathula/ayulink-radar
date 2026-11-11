import type { NoiseRow } from "@/lib/results";

interface Props {
  rows: NoiseRow[];
}

const W = 720;
const H = 300;
const PAD = { left: 46, right: 16, top: 22, bottom: 44 };

export function NoiseChart({ rows }: Props) {
  const x = (index: number) =>
    PAD.left + (index / Math.max(rows.length - 1, 1)) * (W - PAD.left - PAD.right);
  const y = (value: number) =>
    H - PAD.bottom - value * (H - PAD.top - PAD.bottom);

  const precision = rows
    .map((row, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(row.personFlagPrecision ?? 0).toFixed(1)}`)
    .join(" ");
  const detection = rows
    .map((row, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(row.detectionRate ?? 0).toFixed(1)}`)
    .join(" ");

  return (
    <figure className="card p-4">
      <figcaption className="text-sm font-medium">
        Noise sweep · village, 80% wear, full engine
      </figcaption>
      <p className="mt-1 text-[11px] text-muted">
        Both individual flag precision and zone-level detection fall as sensor
        noise rises. The community signal does not hold up longer.
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-auto w-full"
        role="img"
        aria-label="Line chart of person-flag precision and zone detection against sensor noise from 0 to 1"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--border)"
              strokeDasharray={value === 0 ? undefined : "3 5"}
            />
            <text
              x={PAD.left - 8}
              y={y(value) + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--muted)"
              fontFamily="var(--font-mono), monospace"
            >
              {Math.round(value * 100)}%
            </text>
          </g>
        ))}
        {rows.map((row, index) => (
          <text
            key={`x-${row.noiseLevel}`}
            x={x(index)}
            y={H - PAD.bottom + 16}
            textAnchor="middle"
            fontSize={10}
            fill="var(--muted)"
            fontFamily="var(--font-mono), monospace"
          >
            {row.noiseLevel.toFixed(1)}
          </text>
        ))}
        <text
          x={(PAD.left + W - PAD.right) / 2}
          y={H - 6}
          textAnchor="middle"
          fontSize={10}
          fill="var(--muted)"
        >
          noise level
        </text>

        <path d={precision} fill="none" stroke="var(--info)" strokeWidth={2} />
        <path d={detection} fill="none" stroke="var(--brand)" strokeWidth={2} />
        {rows.map((row, index) => (
          <g key={row.noiseLevel}>
            <circle cx={x(index)} cy={y(row.personFlagPrecision ?? 0)} r={3.2} fill="var(--info)">
              <title>{`Noise ${row.noiseLevel.toFixed(1)} · person precision ${((row.personFlagPrecision ?? 0) * 100).toFixed(1)}%`}</title>
            </circle>
            <circle cx={x(index)} cy={y(row.detectionRate ?? 0)} r={3.2} fill="var(--brand)">
              <title>{`Noise ${row.noiseLevel.toFixed(1)} · zone detection ${((row.detectionRate ?? 0) * 100).toFixed(1)}%`}</title>
            </circle>
          </g>
        ))}
        <g transform={`translate(${PAD.left + 4} ${PAD.top + 2})`}>
          <line x1={0} y1={0} x2={18} y2={0} stroke="var(--info)" strokeWidth={2} />
          <text x={24} y={3.5} fontSize={10} fill="var(--muted)">
            Person-flag precision
          </text>
          <line x1={150} y1={0} x2={168} y2={0} stroke="var(--brand)" strokeWidth={2} />
          <text x={174} y={3.5} fontSize={10} fill="var(--muted)">
            Zone detection
          </text>
        </g>
      </svg>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-left text-[11px]">
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1.5 pr-3 font-medium">Noise</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Person precision</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Zone detection</th>
              <th scope="col" className="py-1.5 font-medium">False alerts / zone / 30d</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.noiseLevel} className="border-t border-border">
                <td className="mono py-1.5 pr-3">{row.noiseLevel.toFixed(1)}</td>
                <td className="mono py-1.5 pr-3">{((row.personFlagPrecision ?? 0) * 100).toFixed(1)}%</td>
                <td className="mono py-1.5 pr-3">{((row.detectionRate ?? 0) * 100).toFixed(1)}%</td>
                <td className="mono py-1.5">{(row.falseAlertsPerZonePer30d ?? 0).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
