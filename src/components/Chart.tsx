import { useEffect, useRef, useState } from "preact/hooks";
import { copy } from "../copy";
import type { SeriesPoint } from "../lib/inflation";
import { formatCompactISK, formatMonthShort } from "../lib/format";

interface ChartProps {
  series: SeriesPoint[];
}

const MARGIN = { top: 18, right: 16, bottom: 30, left: 60 };

/** Round y-axis ticks to friendly values. */
function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step =
    (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) *
    magnitude;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
    ticks.push(v);
  }
  return ticks;
}

/** Calendar-aligned x ticks: every 3/6/12/24 months depending on span. */
function xTickIndices(series: SeriesPoint[]): { indices: number[]; step: number } {
  const n = series.length;
  const step = n <= 20 ? 3 : n <= 40 ? 6 : n <= 96 ? 12 : 24;
  const indices = series
    .map((p, i) => ({ i, m: Number(p.month.split("-")[1]), y: Number(p.month.split("-")[0]) }))
    .filter(({ m, y }) =>
      step < 12 ? (m - 1) % step === 0 : m === 1 && y % (step / 12) === 0,
    )
    .map(({ i }) => i);
  return { indices, step };
}

export function Chart({ series }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (series.length < 2) return null;

  const height = width < 480 ? 280 : 360;
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const reals = series.map((p) => p.real);
  const nominals = series.map((p) => p.nominal);
  const yMin = Math.min(...reals) * 0.95;
  const yMax = Math.max(...nominals) * 1.03;

  const x = (i: number) => MARGIN.left + (i / (series.length - 1)) * innerW;
  const y = (v: number) =>
    MARGIN.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  // Nominal: step-after — hold each value until the next change.
  let stepPath = `M ${x(0)} ${y(series[0].nominal)}`;
  for (let i = 1; i < series.length; i++) {
    stepPath += ` H ${x(i)}`;
    if (series[i].nominal !== series[i - 1].nominal) {
      stepPath += ` V ${y(series[i].nominal)}`;
    }
  }

  // Real value: straight monthly segments.
  const realPath = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.real)}`)
    .join(" ");

  // Lost value: the region between the two lines (real forward, step back).
  let bandPath = realPath;
  for (let i = series.length - 1; i >= 0; i--) {
    bandPath += ` L ${x(i)} ${y(series[i].nominal)}`;
    if (i > 0 && series[i].nominal !== series[i - 1].nominal) {
      bandPath += ` L ${x(i)} ${y(series[i - 1].nominal)}`;
    }
  }
  bandPath += " Z";

  const yTicks = niceTicks(yMin, yMax, 4);
  const { indices: xIndices, step: xStep } = xTickIndices(series);

  const raiseIndices = series
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.month === p.baselineMonth)
    .map(({ i }) => i);

  const last = series.length - 1;
  const c = copy.chart;

  return (
    <section class="chart-section" aria-labelledby="chart-title">
      <h2 id="chart-title">{c.title}</h2>
      <div class="chart-legend">
        <span class="legend-item">
          <span class="legend-swatch swatch-nominal" /> {c.legendNominal}
        </span>
        <span class="legend-item">
          <span class="legend-swatch swatch-real" /> {c.legendReal}
        </span>
        <span class="legend-item">
          <span class="legend-swatch swatch-loss" /> {c.legendLoss}
        </span>
      </div>
      <div class="chart-card card" ref={containerRef}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={c.title}
        >
          <defs>
            <linearGradient id="loss-band" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--coral)" stop-opacity="0.34" />
              <stop offset="100%" stop-color="var(--coral)" stop-opacity="0.05" />
            </linearGradient>
          </defs>

          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(v)}
                y2={y(v)}
                class="gridline"
              />
              <text x={MARGIN.left - 8} y={y(v)} class="tick-label tick-y">
                {formatCompactISK(v)}
              </text>
            </g>
          ))}

          {xIndices.map((i) => (
            <text key={i} x={x(i)} y={height - 8} class="tick-label tick-x">
              {xStep >= 12
                ? series[i].month.split("-")[0]
                : formatMonthShort(series[i].month)}
            </text>
          ))}

          <path d={bandPath} fill="url(#loss-band)" class="band" />
          <path d={stepPath} class="line-nominal" />
          <path d={realPath} class="line-real" />

          {raiseIndices.map((i) => (
            <g key={series[i].month}>
              <line
                x1={x(i)}
                x2={x(i)}
                y1={y(series[i].nominal)}
                y2={MARGIN.top + innerH}
                class="raise-hairline"
              />
              <circle
                cx={x(i)}
                cy={y(series[i].nominal)}
                r="4.5"
                class="raise-dot"
              >
                <title>
                  {c.raiseMarker}: {formatMonthShort(series[i].month)}
                </title>
              </circle>
            </g>
          ))}

          <circle cx={x(last)} cy={y(series[last].real)} r="4.5" class="today-dot" />
          <text
            x={x(last)}
            y={y(series[last].real) - 12}
            class="today-label"
          >
            {c.today}
          </text>
        </svg>
      </div>
    </section>
  );
}
