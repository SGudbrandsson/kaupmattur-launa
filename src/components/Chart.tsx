import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { copy } from "../copy";
import type { CpiData } from "../lib/cpi";
import type { ChartFrame, SalaryEvent } from "../lib/inflation";
import { analyzePurchasingPower, buildSeries } from "../lib/inflation";
import {
  formatCompactISK,
  formatISK,
  formatISKDelta,
  formatMonth,
  formatMonthShort,
  formatPercent,
} from "../lib/format";

interface ChartProps {
  events: SalaryEvent[];
  cpi: CpiData;
}

const MARGIN = { top: 18, right: 16, bottom: 30 };
const LABEL_CHAR_W = 6.8;
const FRAMES: ChartFrame[] = ["today", "origin", "keepPace"];

function frameLabel(frame: ChartFrame): string {
  return frame === "today"
    ? copy.chart.frameToday
    : frame === "origin"
      ? copy.chart.frameOrigin
      : copy.chart.frameKeepPace;
}

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

function xTickIndices(
  series: { month: string }[],
  innerW: number,
): { indices: number[]; step: number } {
  const n = series.length;
  const pick = (step: number) =>
    series
      .map((p, i) => ({
        i,
        m: Number(p.month.split("-")[1]),
        y: Number(p.month.split("-")[0]),
      }))
      .filter(({ m, y }) =>
        step < 12 ? (m - 1) % step === 0 : m === 1 && y % (step / 12) === 0,
      )
      .map(({ i }) => i);
  for (const step of [3, 6, 12, 24, 48]) {
    if (step < 3 * Math.ceil(n / 40)) continue;
    const indices = pick(step);
    const labelW = step >= 12 ? 42 : 64;
    if (indices.length * labelW <= innerW || step === 48) {
      return { indices, step };
    }
  }
  return { indices: pick(48), step: 48 };
}

export function Chart({ events, cpi }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [frame, setFrame] = useState<ChartFrame>("today");

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

  const series = useMemo(
    () => buildSeries(events, cpi, frame),
    [events, cpi, frame],
  );
  const pp = useMemo(() => analyzePurchasingPower(events, cpi), [events, cpi]);

  if (series.length < 2) return null;

  const c = copy.chart;
  const height = width < 480 ? 280 : 360;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const comparisons = series.map((p) => p.comparison);
  const nominals = series.map((p) => p.nominal);
  const yMin = Math.min(Math.min(...comparisons), Math.min(...nominals)) * 0.95;
  const yMax = Math.max(Math.max(...comparisons), Math.max(...nominals)) * 1.03;

  const yTicks = niceTicks(yMin, yMax, 4);
  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : undefined;
  const yLabel = (v: number) => formatCompactISK(v, yStep);

  const maxLabelChars = Math.max(...yTicks.map((v) => yLabel(v).length));
  const marginLeft = Math.max(44, Math.round(14 + maxLabelChars * LABEL_CHAR_W));
  const innerW = width - marginLeft - MARGIN.right;

  const x = (i: number) => marginLeft + (i / (series.length - 1)) * innerW;
  const y = (v: number) =>
    MARGIN.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  let stepPath = `M ${x(0)} ${y(series[0].nominal)}`;
  for (let i = 1; i < series.length; i++) {
    stepPath += ` H ${x(i)}`;
    if (series[i].nominal !== series[i - 1].nominal) {
      stepPath += ` V ${y(series[i].nominal)}`;
    }
  }

  const comparePath = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.comparison)}`)
    .join(" ");

  let bandPath = "";
  if (frame === "origin") {
    bandPath = comparePath;
    for (let i = series.length - 1; i >= 0; i--) {
      bandPath += ` L ${x(i)} ${y(series[i].nominal)}`;
      if (i > 0 && series[i].nominal !== series[i - 1].nominal) {
        bandPath += ` L ${x(i)} ${y(series[i - 1].nominal)}`;
      }
    }
    bandPath += " Z";
  }

  const { indices: xIndices, step: xStep } = xTickIndices(series, innerW);

  const raiseIndices = series
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.month === p.eventMonth)
    .map(({ i }) => i);

  const last = series.length - 1;
  const peakIndex =
    pp && frame !== "keepPace"
      ? series.findIndex((p) => p.month === pp.peakMonth)
      : -1;

  const seriesKey = `${frame}|${series[0].month}|${last}|${raiseIndices.join(",")}|${series[0].nominal}`;

  const indexFromEvent = (e: PointerEvent) => {
    const svg = e.currentTarget as SVGElement;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const frac = (px - marginLeft) / innerW;
    return Math.max(0, Math.min(last, Math.round(frac * last)));
  };

  const active = series[hover ?? last];
  const delta =
    frame === "origin"
      ? active.comparison - active.nominal
      : frame === "today"
        ? active.comparison - (pp?.peakValueToday ?? active.comparison)
        : active.nominal - active.comparison;
  const deltaPct =
    frame === "keepPace"
      ? active.nominal / active.comparison - 1
      : frame === "today"
        ? active.comparison / (pp?.peakValueToday ?? active.comparison) - 1
        : active.comparison / active.nominal - 1;
  const deltaClass = delta < 0 ? "readout-loss" : "readout-gain";

  const compareLabel =
    frame === "today"
      ? c.compareToday
      : frame === "keepPace"
        ? c.compareKeepPace
        : c.compareOrigin;
  const deltaLabel = delta < 0 ? c.tooltipLoss : c.tooltipGain;

  return (
    <section class="chart-section" aria-labelledby="chart-title">
      <h2 id="chart-title">{c.title}</h2>

      <div class="frame-chips" role="group" aria-label={c.framePickLabel}>
        {FRAMES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={f === frame}
            class={`frame-chip${f === frame ? " is-on" : ""}`}
            onClick={() => setFrame(f)}
          >
            {frameLabel(f)}
          </button>
        ))}
      </div>

      <div class="chart-legend">
        <span class="legend-item">
          <span class="legend-swatch swatch-nominal" /> {c.legendNominal}
        </span>
        <span class="legend-item">
          <span class="legend-swatch swatch-real" /> {compareLabel}
        </span>
        {frame === "origin" && (
          <span class="legend-item">
            <span class="legend-swatch swatch-loss" /> {c.legendLoss}
          </span>
        )}
      </div>

      <div class="chart-card card" ref={containerRef}>
        <div class="chart-readout numeric" aria-live="polite">
          <span class="readout-month">
            {hover === null ? c.today : formatMonth(active.month)}
          </span>
          <span class="readout-item">
            <span class="readout-label">{c.tooltipNominal}</span>
            {formatISK(active.nominal)}
          </span>
          <span class="readout-item readout-real">
            <span class="readout-label">{compareLabel}</span>
            {formatISK(active.comparison)}
          </span>
          <span class={`readout-item ${deltaClass}`}>
            <span class="readout-label">{deltaLabel}</span>
            {Math.abs(delta) < 1
              ? "—"
              : `${formatISKDelta(delta)} (${formatPercent(deltaPct)})`}
          </span>
        </div>

        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={c.title}
          onPointerMove={(e) => setHover(indexFromEvent(e))}
          onPointerDown={(e) => setHover(indexFromEvent(e))}
          onPointerLeave={() => setHover(null)}
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
                x1={marginLeft}
                x2={width - MARGIN.right}
                y1={y(v)}
                y2={y(v)}
                class="gridline"
              />
              <text x={marginLeft - 8} y={y(v)} class="tick-label tick-y">
                {yLabel(v)}
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

          {frame === "today" && pp && (
            <line
              x1={marginLeft}
              x2={width - MARGIN.right}
              y1={y(pp.nowValue)}
              y2={y(pp.nowValue)}
              class="now-line"
            />
          )}

          <g key={seriesKey}>
            {bandPath && <path d={bandPath} fill="url(#loss-band)" class="band" />}
            <path
              d={stepPath}
              class={`line-nominal draw${frame === "today" ? " is-muted" : ""}`}
              pathLength={1}
            />
            <path d={comparePath} class="line-real draw" pathLength={1} />
          </g>

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

          {peakIndex >= 0 && (
            <g class="peak">
              <circle
                cx={x(peakIndex)}
                cy={y(series[peakIndex].comparison)}
                r="4.5"
                class="peak-dot"
              />
              <text
                x={x(peakIndex)}
                y={y(series[peakIndex].comparison) - 12}
                class="peak-label"
              >
                {c.peakLabel(formatMonthShort(series[peakIndex].month))}
              </text>
            </g>
          )}

          <circle
            cx={x(last)}
            cy={y(series[last].comparison)}
            r="4.5"
            class="today-dot"
          />

          {hover !== null && (
            <g class="crosshair">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={MARGIN.top}
                y2={MARGIN.top + innerH}
                class="crosshair-line"
              />
              <circle
                cx={x(hover)}
                cy={y(active.nominal)}
                r="4"
                class="crosshair-dot-nominal"
              />
              <circle
                cx={x(hover)}
                cy={y(active.comparison)}
                r="4"
                class="crosshair-dot-real"
              />
            </g>
          )}
        </svg>
      </div>
      <p class="chart-anchor-note">
        {frame === "today"
          ? c.noteToday
          : frame === "keepPace"
            ? c.noteKeepPace(formatMonth(series[0].month))
            : c.anchorNote(formatMonth(series[0].month))}
      </p>
    </section>
  );
}
