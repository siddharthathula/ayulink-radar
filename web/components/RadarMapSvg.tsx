"use client";

import type {
  DayObs,
  DriftPoint,
  Mode,
  Person,
  Zone,
  ZoneDay,
} from "@/lib/engine/types";
import { PRESETS } from "@/lib/engine/presets";
import { hashString } from "@/lib/ui/geo";
import { mulberry32 } from "@/lib/engine/rng";

interface Props {
  mode: Mode;
  zones: Zone[];
  people: Person[];
  obs: Record<string, DayObs[]>;
  drift: Record<string, DriftPoint[]>;
  zoneDays: ZoneDay[];
  day: number;
  seed: number;
  rhythmFlags: Record<string, boolean>;
  selectedZoneId: string | null;
  selectedPersonId: string | null;
  onSelectZone: (zoneId: string | null) => void;
  onSelectPerson: (personId: string) => void;
}

const CELL_W = 190;
const CELL_H = 150;
const PAD = 16;
const GAP = 8;

export function RadarMapSvg({
  mode,
  zones,
  people,
  obs,
  drift,
  zoneDays,
  day,
  seed,
  rhythmFlags,
  selectedZoneId,
  selectedPersonId,
  onSelectZone,
  onSelectPerson,
}: Props) {
  const preset = PRESETS[mode];
  const rows = Math.max(...zones.map((zone) => zone.row)) + 1;
  const width = preset.columns * (CELL_W + GAP) + PAD * 2;
  const height = rows * (CELL_H + GAP) + PAD * 2;

  const levelByZone = new Map<string, string>();
  for (const row of zoneDays) {
    if (row.day === day) levelByZone.set(row.zoneId, row.level);
  }
  const regionWide = zoneDays.some((row) => row.day === day && row.regionWide);

  return (
    <div className="w-full">
      <div className="flex h-[300px] w-full items-center justify-center bg-[var(--map-bg)] sm:h-[500px] xl:h-[560px] 2xl:h-[600px]">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        role="img"
        aria-label="Schematic radar map of illustrative zones. Dot positions are random and carry no address information."
      >
        {zones.map((zone) => {
          const x = PAD + zone.col * (CELL_W + GAP);
          const y = PAD + zone.row * (CELL_H + GAP);
          const level = levelByZone.get(zone.id) ?? "normal";
          const color =
            level === "alert" ? "var(--dot-alert)" : level === "watch" ? "var(--dot-watch)" : "var(--dot-normal)";
          const inZone = people.filter((person) => person.zoneId === zone.id);
          const selected = selectedZoneId === zone.id;

          return (
            <g key={zone.id}>
              <rect
                x={x}
                y={y}
                width={CELL_W}
                height={CELL_H}
                rx={14}
                fill={color}
                fillOpacity={level === "alert" ? 0.14 : level === "watch" ? 0.09 : 0.03}
                stroke={selected ? "var(--text)" : color}
                strokeWidth={selected ? 2 : level === "normal" ? 1 : 2}
                strokeDasharray={level === "normal" ? "3 5" : undefined}
                onClick={() => onSelectZone(zone.id)}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`${zone.name}, ${inZone.length} wearers, level ${level}`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectZone(zone.id);
                  }
                }}
              />
              <text
                x={x + 12}
                y={y + 22}
                fill="var(--text)"
                fontSize={12}
                fontWeight={600}
                fontFamily="var(--font-heading), sans-serif"
                pointerEvents="none"
              >
                {zone.name}
              </text>
              <text
                x={x + CELL_W - 12}
                y={y + 22}
                textAnchor="end"
                fill="var(--muted)"
                fontSize={10}
                fontFamily="var(--font-mono), monospace"
                pointerEvents="none"
              >
                {inZone.length}
              </text>
              {level === "alert" ? (
                <g pointerEvents="none">
                  <rect
                    x={x + 10}
                    y={y + 30}
                    width={92}
                    height={18}
                    rx={9}
                    fill="var(--dot-alert)"
                    fillOpacity={0.18}
                  />
                  <text
                    x={x + 18}
                    y={y + 43}
                    fill="var(--dot-alert)"
                    fontSize={9}
                    fontWeight={600}
                    fontFamily="var(--font-body), sans-serif"
                  >
                    Cluster alert
                  </text>
                </g>
              ) : null}
              {inZone.map((person) => {
                const rand = mulberry32(hashString(`${seed}:${person.id}`));
                const cx = x + 14 + rand() * (CELL_W - 28);
                const cy = y + 58 + rand() * (CELL_H - 74);
                const observation = obs[person.id]?.[day];
                const driftPoint = drift[person.id]?.[day];
                const worn = observation?.valid === true;
                const flagged = driftPoint?.flagged === true;
                const rhythm = rhythmFlags[person.id] === true;
                const fill = flagged ? "var(--dot-watch)" : "var(--dot-normal)";
                const selectedPerson = selectedPersonId === person.id;
                const tappable = mode !== "society";

                return (
                  <g key={person.id}>
                    {rhythm && worn ? (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={7}
                        fill="none"
                        stroke="var(--dot-rhythm)"
                        strokeWidth={1.4}
                        pointerEvents="none"
                      />
                    ) : null}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={selectedPerson ? 5 : 4}
                      fill={worn ? fill : "none"}
                      fillOpacity={worn ? 0.95 : 0}
                      stroke={selectedPerson ? "var(--text)" : fill}
                      strokeWidth={selectedPerson ? 2 : 1}
                      strokeOpacity={worn ? 1 : 0.45}
                      onClick={
                        tappable
                          ? (event) => {
                              event.stopPropagation();
                              onSelectPerson(person.id);
                            }
                          : undefined
                      }
                      className={tappable ? "cursor-pointer" : undefined}
                      tabIndex={tappable ? 0 : undefined}
                      role={tappable ? "button" : undefined}
                      aria-label={
                        tappable
                          ? `${person.id}, ${person.age} years${flagged ? ", drift flag" : worn ? "" : ", not worn"}`
                          : undefined
                      }
                      onKeyDown={
                        tappable
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onSelectPerson(person.id);
                              }
                            }
                          : undefined
                      }
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      </div>
      {regionWide ? (
        <p className="border-t border-amber-100 bg-watch-soft px-4 py-2 text-xs font-medium text-watch">
          Region-wide shift — not a local cluster. Levels were downgraded for this day.
        </p>
      ) : null}
    </div>
  );
}
