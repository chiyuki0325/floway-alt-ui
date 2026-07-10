import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactElement } from "react";
import { redirect } from "react-router";
import { useTranslation } from "react-i18next";
import { curveMonotoneX } from "d3-shape";
import {
  ArrowClockwiseRegular,
  ArrowRepeatAllRegular,
  SelectAllOffRegular,
  SelectAllOnRegular,
} from "@fluentui/react-icons";
import type {
  ChartProps,
  CustomizedCalloutData,
  LineChartProps,
} from "@fluentui/react-charts";

import type { Route } from "./+types/dashboard-monitor-performance";
import { authFetch, callApi } from "../api/auth";
import { getSessionToken } from "../auth/session";
import { PageLoadingPanel } from "../components/page-loading-panel";
import { OutlineCard } from "../components/outline-card";
import { Panel } from "../components/panel";
import { SegmentedControl } from "../components/segmented-control";
import { fluentComponents } from "../fluent";
import { useAuthStore } from "../stores/auth-store";
import { useDashboardOutletContext } from "./dashboard";

const {
  Button,
  InteractionTag,
  InteractionTagPrimary,
  makeStyles,
  Select,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Tooltip,
} = fluentComponents;

type PerformanceView = "all-by-user" | "self-by-key";
type Range = "today" | "7d" | "30d";
type Scope = "request_total" | "upstream_success";
type ChartView = "model" | "percentile";
type PercentileKey = "p50Ms" | "p95Ms" | "p99Ms";

interface PerformanceDisplayRecord {
  bucket: string;
  group: string;
  requests: number;
  errors: number;
  totalMsSum: number;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

interface PerformanceOverviewResponse {
  series: PerformanceDisplayRecord[];
  summaryRows: PerformanceDisplayRecord[];
  modelRows: PerformanceDisplayRecord[];
  runtimeRows: PerformanceDisplayRecord[];
}

interface Bucket {
  key: string;
  label: string;
  date: Date;
}

interface ChartEntry {
  id: string;
  label: string;
  colorSlot: number;
}

interface PerformanceChartModel {
  data: ChartProps;
  entries: ChartEntry[];
  buckets: Bucket[];
  range: Range;
}

const chartMargins = { top: 16, right: 20, bottom: 42, left: 60 } as const;

const emptyOverview = (): PerformanceOverviewResponse => ({
  series: [],
  summaryRows: [],
  modelRows: [],
  runtimeRows: [],
});

const chartColors = [
  "#0f6cbd",
  "#13a10e",
  "#c50f1f",
  "#ca5010",
  "#8764b8",
  "#038387",
  "#8e562e",
  "#0078d4",
  "#498205",
  "#881798",
];

const useErrorStyles = makeStyles({
  root: {
    backgroundColor: "var(--colorPaletteRedBackground2)",
    border: "1px solid var(--colorPaletteRedBorder1)",
    borderRadius: "8px",
    color: "var(--colorPaletteRedForeground1)",
    padding: "10px 12px",
  },
});

const useChartStateStyles = makeStyles({
  root: {
    alignItems: "center",
    color: "var(--colorNeutralForeground3)",
    display: "grid",
    fontSize: "13px",
    height: "100%",
    justifyItems: "center",
  },
});

const usePerformanceChartStyles = makeStyles({
  root: {
    "& .fui-cart__xAxis line": {
      pointerEvents: "none",
    },
    '& circle[id*="staticHighlightCircle"]': {
      pointerEvents: "none",
      visibility: "hidden",
    },
  },
});

const pad2 = (value: number): string => String(value).padStart(2, "0");

const localHourKey = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}`;

const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const local4hBucketStart = (date: Date): Date => {
  const aligned = new Date(date);
  aligned.setMinutes(0, 0, 0);
  aligned.setHours(aligned.getHours() - (aligned.getHours() % 4));
  return aligned;
};

const localeForLanguage = (language: string): string =>
  language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";

const shortMonthDay = (date: Date, locale: string): string =>
  date.toLocaleDateString(locale, { month: "short", day: "numeric" });

const bucketLabel = (date: Date, range: Range, locale: string): string => {
  if (range === "30d") return shortMonthDay(date, locale);
  const start = date.getHours();
  const end = range === "7d" ? (start + 4) % 24 : (start + 1) % 24;
  const time = `${pad2(start)}:00 - ${pad2(end)}:00`;
  return range === "7d" ? `${shortMonthDay(date, locale)} ${time}` : time;
};

const dashboardBuckets = (range: Range, nowMs: number, locale: string): Bucket[] => {
  if (range === "today") {
    const current = new Date(nowMs);
    current.setMinutes(0, 0, 0);
    return Array.from({ length: 24 }, (_, index) => {
      const date = new Date(current.getTime() - (23 - index) * 3_600_000);
      return { key: localHourKey(date), label: bucketLabel(date, range, locale), date };
    });
  }
  if (range === "7d") {
    const current = local4hBucketStart(new Date(nowMs));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(current.getTime() - (41 - index) * 4 * 3_600_000);
      return { key: localHourKey(date), label: bucketLabel(date, range, locale), date };
    });
  }
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(nowMs);
    date.setDate(date.getDate() - (29 - index));
    date.setHours(0, 0, 0, 0);
    return { key: localDateKey(date), label: bucketLabel(date, range, locale), date };
  });
};

const dashboardRangeQuery = (
  range: Range,
  nowMs: number,
): { start: string; end: string; bucket: "hour" | "4h" | "day" } => {
  const now = new Date(nowMs);
  const start = new Date(now);
  if (range === "today") {
    start.setTime(now.getTime() - 23 * 3_600_000);
    start.setMinutes(0, 0, 0);
  } else if (range === "7d") {
    start.setTime(local4hBucketStart(now).getTime() - 41 * 4 * 3_600_000);
  } else {
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  }
  return {
    start: start.toISOString().slice(0, 13),
    end: new Date(now.getTime() + 3_600_000).toISOString().slice(0, 13),
    bucket: range === "today" ? "hour" : range === "7d" ? "4h" : "day",
  };
};

const requestOverview = async (
  view: PerformanceView,
  range: Range,
  scope: Scope,
  requestedAt: number,
): Promise<{ overview: PerformanceOverviewResponse; error: string | null }> => {
  const { start, end, bucket } = dashboardRangeQuery(range, requestedAt);
  const search = new URLSearchParams({
    start,
    end,
    bucket,
    metric_scope: scope,
    timezone_offset_minutes: String(new Date().getTimezoneOffset()),
    view,
  });
  const result = await callApi<PerformanceOverviewResponse>(() =>
    authFetch(`/api/performance/overview?${search.toString()}`),
  );
  return {
    overview: result.data ?? emptyOverview(),
    error: result.error?.message ?? null,
  };
};

export async function clientLoader() {
  if (!getSessionToken()) throw redirect("/");
  return null;
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Performance | Floway" }];
}

export default function DashboardMonitorPerformance() {
  const { i18n, t } = useTranslation();
  const { user } = useDashboardOutletContext();
  const clearAuth = useAuthStore((state) => state.clear);
  const [view, setView] = useState<PerformanceView>(
    user.canViewGlobalTelemetry ? "all-by-user" : "self-by-key",
  );
  const [range, setRange] = useState<Range>("today");
  const [loadedRange, setLoadedRange] = useState<Range>("today");
  const [loadedAt, setLoadedAt] = useState(Date.now());
  const [scope, setScope] = useState<Scope>("request_total");
  const [chartView, setChartView] = useState<ChartView>("model");
  const [percentile, setPercentile] = useState<PercentileKey>("p95Ms");
  const [model, setModel] = useState("");
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());
  const [overview, setOverview] = useState<PerformanceOverviewResponse>(emptyOverview);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const errorStyles = useErrorStyles();
  const locale = localeForLanguage(i18n.language);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const requestedAt = Date.now();
    const requestedRange = range;
    const requestedScope = scope;
    const requestedView = view;
    setLoading(true);
    setError(null);

    try {
      const next = await requestOverview(
        requestedView,
        requestedRange,
        requestedScope,
        requestedAt,
      );
      if (requestId !== requestIdRef.current) return;
      setOverview(next.overview);
      setLoadedRange(requestedRange);
      setLoadedAt(requestedAt);
      setError(next.error);
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  }, [range, scope, view]);

  useEffect(() => {
    void refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (error === "HTTP 401") clearAuth();
  }, [clearAuth, error]);

  const models = useMemo(
    () => [...new Set(overview.series.map((record) => record.group))].sort(),
    [overview.series],
  );

  useEffect(() => {
    if (!models.length) setModel("");
    else if (!models.includes(model)) setModel(models[0]!);
  }, [model, models]);

  useEffect(() => {
    setHiddenSeries(new Set());
  }, [chartView]);

  const buckets = useMemo(
    () => dashboardBuckets(loadedRange, loadedAt, locale),
    [loadedAt, loadedRange, locale],
  );
  const chart = useMemo(
    () => buildPerformanceChart(overview.series, chartView, percentile, model, buckets, loadedRange),
    [buckets, chartView, loadedRange, model, overview.series, percentile],
  );
  const summaryRow = overview.summaryRows[0];
  const summary = [
    ["successful", formatCount((summaryRow?.requests ?? 0) - (summaryRow?.errors ?? 0), locale)],
    ["errors", formatCount(summaryRow?.errors ?? 0, locale)],
    ["average", formatDuration(summaryRow?.avgMs ?? null)],
    ["p50", formatDuration(summaryRow?.p50Ms ?? null)],
    ["p95", formatDuration(summaryRow?.p95Ms ?? null)],
    ["p99", formatDuration(summaryRow?.p99Ms ?? null)],
  ] as const;

  return (
    <section className="grid gap-[18px] min-w-0">
      <header className="flex items-start justify-between gap-[18px] min-w-0">
        <div className="grid gap-[6px] min-w-0">
          <Text size={200} weight="semibold" className="text-fui-fg2 leading-[1.2] uppercase">
            {t("dashboard.groups.monitor")}
          </Text>
          <Text size={700} weight="semibold">{t("dashboard.nav.performance")}</Text>
          <Text size={300} className="text-fui-fg2 leading-[1.45] max-w-[760px]">
            {t("dashboard.pages.performance")}
          </Text>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {loading && !initialLoading && <Spinner size="tiny" label={t("dashboard.performance.refreshing")} />}
          <Tooltip content={t("dashboard.performance.actions.refresh")} relationship="label">
            <Button
              appearance="subtle"
              disabled={initialLoading}
              icon={<ArrowClockwiseRegular />}
              onClick={() => void refresh()}
            />
          </Tooltip>
        </div>
      </header>

      {initialLoading ? (
        <PageLoadingPanel label={t("common.loading")} />
      ) : (
        <>
          {error && <div className={errorStyles.root}>{error}</div>}
          <Panel className="!grid gap-[18px] min-w-0 !p-[18px]">
            <div className="flex items-start gap-3 justify-between min-w-0 max-[1100px]:flex-col max-[1100px]:items-stretch">
              <div className="flex items-center flex-wrap gap-2.5 min-w-0">
                <Text size={200} weight="semibold" className="text-fui-fg3 leading-[1.2]">
                  {t("dashboard.performance.latency")}
                </Text>
                {user.canViewGlobalTelemetry && (
                  <SegmentedControl
                    ariaLabel={t("dashboard.performance.view.label")}
                    items={[
                      { value: "all-by-user", label: t("dashboard.performance.view.allByUser") },
                      { value: "self-by-key", label: t("dashboard.performance.view.myKeys") },
                    ]}
                    onChange={(value) => setView(value as PerformanceView)}
                    value={view}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <SegmentedControl
                  ariaLabel={t("dashboard.performance.scope.label")}
                  items={[
                    { value: "request_total", label: t("dashboard.performance.scope.total") },
                    { value: "upstream_success", label: t("dashboard.performance.scope.upstream") },
                  ]}
                  onChange={(value) => setScope(value as Scope)}
                  value={scope}
                />
                <SegmentedControl
                  ariaLabel={t("dashboard.performance.chartView.label")}
                  items={[
                    { value: "model", label: t("dashboard.performance.chartView.model") },
                    { value: "percentile", label: t("dashboard.performance.chartView.percentile") },
                  ]}
                  onChange={(value) => setChartView(value as ChartView)}
                  value={chartView}
                />
                {chartView === "model" ? (
                  <SegmentedControl
                    ariaLabel={t("dashboard.performance.percentile.label")}
                    items={(["p50Ms", "p95Ms", "p99Ms"] as PercentileKey[]).map((value) => ({
                      value,
                      label: value.replace("Ms", ""),
                    }))}
                    onChange={(value) => setPercentile(value as PercentileKey)}
                    value={percentile}
                  />
                ) : (
                  <Select
                    aria-label={t("dashboard.performance.model.label")}
                    className="min-w-[176px] max-w-[260px]"
                    disabled={!models.length}
                    onChange={(_, data) => setModel(data.value)}
                    value={model}
                  >
                    {models.map((value) => <option key={value} value={value}>{value}</option>)}
                  </Select>
                )}
                <SegmentedControl
                  ariaLabel={t("dashboard.performance.range.label")}
                  items={[
                    { value: "today", label: t("dashboard.performance.range.today") },
                    { value: "7d", label: t("dashboard.performance.range.sevenDays") },
                    { value: "30d", label: t("dashboard.performance.range.thirtyDays") },
                  ]}
                  onChange={(value) => setRange(value as Range)}
                  value={range}
                />
              </div>
            </div>

            <div className="grid gap-2.5 grid-cols-6 max-[900px]:grid-cols-3 max-[520px]:grid-cols-2">
              {summary.map(([label, value]) => (
                <OutlineCard className="!p-[10px] min-w-0" key={label}>
                  <Text size={200} weight="semibold" className="text-fui-fg2 leading-[1.2]">
                    {t(`dashboard.performance.summary.${label}`)}
                  </Text>
                  <Text size={500} weight="semibold" className="font-mono overflow-wrap-anywhere">
                    {value}
                  </Text>
                </OutlineCard>
              ))}
            </div>
          </Panel>

          <Panel className="!grid gap-[18px] min-w-0 !p-[18px]">
            <PerformanceChartSection
              chart={chart}
              hidden={hiddenSeries}
              onHiddenChange={setHiddenSeries}
              title={
                chartView === "model"
                  ? t("dashboard.performance.chartTitle.byModel", { percentile: percentile.replace("Ms", "") })
                  : t("dashboard.performance.chartTitle.byPercentile", { model: model || t("dashboard.performance.model.all") })
              }
            />
          </Panel>

          <Panel className="!grid gap-[18px] min-w-0 !p-[18px]">
            <div className={`grid items-start gap-[18px] min-w-0 ${overview.runtimeRows.length ? "grid-cols-2 max-[900px]:grid-cols-1" : "grid-cols-1"}`}>
              <PerformanceTable
                ariaLabel={t("dashboard.performance.tables.byModel")}
                firstColumn={t("dashboard.performance.tables.model")}
                percentile={percentile}
                rows={overview.modelRows}
                title={t("dashboard.performance.tables.byModel")}
              />
              {overview.runtimeRows.length > 0 && (
                <PerformanceTable
                  ariaLabel={t("dashboard.performance.tables.byRegion")}
                  firstColumn={t("dashboard.performance.tables.region")}
                  percentile={percentile}
                  rows={overview.runtimeRows}
                  title={t("dashboard.performance.tables.byRegion")}
                />
              )}
            </div>
          </Panel>
        </>
      )}
    </section>
  );
}

function PerformanceChartSection({
  chart,
  hidden,
  onHiddenChange,
  title,
}: {
  chart: PerformanceChartModel;
  hidden: Set<string>;
  onHiddenChange: (next: Set<string>) => void;
  title: string;
}) {
  const { t } = useTranslation();
  const ids = chart.entries.map((entry) => entry.id);
  return (
    <section className="grid gap-3 min-w-0">
      <div className="flex items-center gap-3 justify-between min-w-0 max-[700px]:flex-col max-[700px]:items-stretch">
        <Text size={400} weight="semibold">{title}</Text>
        <div className="flex items-center flex-none gap-1" aria-label={t("dashboard.performance.series.label")}>
          <Tooltip content={t("dashboard.performance.series.all")} relationship="label">
            <Button appearance="subtle" icon={<SelectAllOnRegular />} onClick={() => onHiddenChange(new Set())} />
          </Tooltip>
          <Tooltip content={t("dashboard.performance.series.invert")} relationship="label">
            <Button
              appearance="subtle"
              icon={<ArrowRepeatAllRegular />}
              onClick={() => onHiddenChange(new Set(ids.filter((id) => !hidden.has(id))))}
            />
          </Tooltip>
          <Tooltip content={t("dashboard.performance.series.none")} relationship="label">
            <Button appearance="subtle" icon={<SelectAllOffRegular />} onClick={() => onHiddenChange(new Set(ids))} />
          </Tooltip>
        </div>
      </div>
      <div className="flex flex-wrap gap-[6px] min-w-0">
        {chart.entries.length ? chart.entries.map((entry) => (
          <InteractionTag appearance="outline" shape="circular" size="small" key={entry.id}>
            <InteractionTagPrimary
              className={hidden.has(entry.id) ? "line-through opacity-[0.55]" : ""}
              icon={<span aria-hidden="true" className="inline-block rounded-full h-[8px] w-[8px] mx-[4px] flex-shrink-0" style={{ backgroundColor: colorForSlot(entry.colorSlot) }} />}
              onClick={(event) => {
                if (event.shiftKey) {
                  onHiddenChange(new Set(ids.filter((id) => id !== entry.id)));
                  return;
                }
                const next = new Set(hidden);
                if (next.has(entry.id)) next.delete(entry.id);
                else next.add(entry.id);
                onHiddenChange(next);
              }}
              onDoubleClick={() => onHiddenChange(new Set(ids.filter((id) => id !== entry.id)))}
              title={t("dashboard.performance.series.toggleHint")}
            >
              {entry.label}
            </InteractionTagPrimary>
          </InteractionTag>
        )) : <Text size={200} className="text-fui-fg2">{t("dashboard.performance.empty")}</Text>}
      </div>
      <OutlineCard className="min-h-[320px] min-w-0 overflow-hidden">
        <PerformanceChart chart={chart} hidden={hidden} />
      </OutlineCard>
    </section>
  );
}

function PerformanceChart({ chart, hidden }: { chart: PerformanceChartModel; hidden: Set<string> }) {
  const { i18n, t } = useTranslation();
  const stateStyles = useChartStateStyles();
  const chartStyles = usePerformanceChartStyles();
  const [LineChart, setLineChart] = useState<ComponentType<LineChartProps> | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const size = useElementSize(host);
  const locale = localeForLanguage(i18n.language);
  const visibleLegends = chart.entries.filter((entry) => !hidden.has(entry.id)).map((entry) => entry.label);
  const visibleValues = chart.data.lineChartData
    ?.filter((series) => visibleLegends.includes(series.legend))
    .flatMap((series) => series.data.map((point) => point.y).filter((value): value is number => typeof value === "number" && value > 0)) ?? [];
  const visibleMin = visibleValues.length ? Math.min(...visibleValues) : undefined;
  const visibleMax = visibleValues.length ? Math.max(...visibleValues) : undefined;
  const visibleData = useMemo<ChartProps>(() => ({
    ...chart.data,
    lineChartData: chart.data.lineChartData?.filter((series) => visibleLegends.includes(series.legend)),
  }), [chart.data, visibleLegends]);
  const labelByTime = useMemo(() => new Map(chart.buckets.map((bucket) => [bucket.date.getTime(), bucket.label])), [chart.buckets]);

  useEffect(() => {
    let disposed = false;
    void import("@fluentui/react-charts").then((module) => {
      if (!disposed) setLineChart(() => module.LineChart);
    });
    return () => { disposed = true; };
  }, []);

  const callout = useCallback((props?: CustomizedCalloutData): ReactElement | null => {
    if (!props?.values.length) return null;
    const rows = props.values.filter((item) => item.y > 0).sort((a, b) => b.y - a.y);
    return (
      <div className="grid gap-[6px] min-w-[220px] max-w-[min(420px,calc(100vw-48px))] p-1">
        <Text size={200} weight="semibold">{formatCalloutTitle(props.x, labelByTime, chart.range, locale)}</Text>
        {rows.map((item) => (
          <Text key={item.legend} size={200} className="flex items-center gap-1.5 justify-between font-mono">
            <span className="flex items-center gap-1.5 min-w-0">
              <i className="rounded-full h-[8px] w-[8px] flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{item.legend}</span>
            </span>
            <span className="flex-shrink-0">{formatDuration(item.y)}</span>
          </Text>
        ))}
      </div>
    );
  }, [chart.range, labelByTime, locale]);

  const hasVisibleData = chart.data.lineChartData?.some((series) => visibleLegends.includes(series.legend));
  const plotHeight = Math.max(0, size.height - chartMargins.top - chartMargins.bottom);
  return (
    <div className={`${chartStyles.root} h-[320px] min-w-0 w-full`} ref={setHost}>
      {!LineChart || size.width < 120 ? (
        <div className={stateStyles.root}>{t("dashboard.performance.loading")}</div>
      ) : hasVisibleData ? (
        <LineChart
          customDateTimeFormatter={(date) => formatAxisDate(date, chart.range, locale)}
          data={visibleData}
          height={size.height}
          hideLegend
          margins={chartMargins}
          onRenderCalloutPerStack={callout}
          tickValues={chartTickValues(chart.buckets).map((bucket) => bucket.date)}
          width={size.width}
          xAxistickSize={-plotHeight}
          yAxisTickFormat={formatDuration}
          yMaxValue={visibleMax}
          yMinValue={visibleMin}
          yScaleType="log"
        />
      ) : (
        <div className={stateStyles.root}>{t("dashboard.performance.empty")}</div>
      )}
    </div>
  );
}

function PerformanceTable({
  ariaLabel,
  firstColumn,
  percentile,
  rows,
  title,
}: {
  ariaLabel: string;
  firstColumn: string;
  percentile: PercentileKey;
  rows: PerformanceDisplayRecord[];
  title: string;
}) {
  const { i18n, t } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  return (
    <section className="grid gap-2.5 min-w-0">
      <Text size={300} weight="semibold">{title}</Text>
      <div className="border border-fui-stroke1 rounded-lg overflow-x-auto min-w-0">
        <Table aria-label={ariaLabel} size="small" className="min-w-[460px]">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{firstColumn}</TableHeaderCell>
              <TableHeaderCell className="!text-right !w-[82px]">{t("dashboard.performance.tables.requests")}</TableHeaderCell>
              <TableHeaderCell className="!text-right !w-[92px]">{percentile.replace("Ms", "")}</TableHeaderCell>
              <TableHeaderCell className="!text-right !w-[92px]">{t("dashboard.performance.tables.average")}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((row) => (
              <TableRow key={row.group}>
                <TableCell><span className="block max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap" title={row.group}>{row.group}</span></TableCell>
                <TableCell className="!text-right font-mono">{formatCount(row.requests, locale)}</TableCell>
                <TableCell className="!text-right font-mono">{formatDuration(row[percentile])}</TableCell>
                <TableCell className="!text-right font-mono text-fui-fg2">{formatDuration(row.avgMs)}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={4}><Text size={200} className="text-fui-fg2">{t("dashboard.performance.empty")}</Text></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function buildPerformanceChart(
  records: PerformanceDisplayRecord[],
  chartView: ChartView,
  percentile: PercentileKey,
  model: string,
  buckets: Bucket[],
  range: Range,
): PerformanceChartModel {
  const groups = [...new Set(records.map((record) => record.group))].sort();
  const entries: ChartEntry[] = chartView === "model"
    ? groups.map((group, colorSlot) => ({ id: group, label: group, colorSlot }))
    : (["p50Ms", "p95Ms", "p99Ms"] as PercentileKey[]).map((value, colorSlot) => ({
        id: value,
        label: value.replace("Ms", ""),
        colorSlot,
      }));

  const values = new Map(records.map((record) => [`${record.bucket}\0${record.group}`, record]));
  return {
    entries,
    buckets,
    range,
    data: {
      chartTitle: "",
      lineChartData: entries.flatMap((entry) => {
        const group = chartView === "model" ? entry.id : model;
        const metric = chartView === "model" ? percentile : entry.id as PercentileKey;
        const data = buckets.flatMap((bucket) => {
          const value = values.get(`${bucket.key}\0${group}`)?.[metric];
          return value === null || value === undefined || value <= 0 ? [] : [{
            x: bucket.date,
            y: value,
            xAxisCalloutData: bucket.label,
            yAxisCalloutData: formatDuration(value),
          }];
        });
        return data.length ? [{
          legend: entry.label,
          color: colorForSlot(entry.colorSlot),
          lineOptions: { strokeWidth: 2, curve: curveMonotoneX },
          data,
        }] : [];
      }),
    },
  };
}

function useElementSize(element: HTMLElement | null) {
  const [size, setSize] = useState({ width: 0, height: 320 });
  useEffect(() => {
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.max(0, Math.floor(rect.width)), height: Math.max(260, Math.floor(rect.height)) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}

function chartTickValues(buckets: Bucket[]): Bucket[] {
  if (buckets.length <= 8) return buckets;
  const desired = buckets.length <= 24 ? 6 : 7;
  const step = Math.ceil((buckets.length - 1) / (desired - 1));
  const ticks = buckets.filter((_, index) => index % step === 0);
  const last = buckets[buckets.length - 1];
  if (last && ticks[ticks.length - 1] !== last) ticks.push(last);
  return ticks;
}

function formatAxisDate(date: Date, range: Range, locale: string): string {
  if (range === "today") return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (range === "7d") return date.toLocaleDateString(locale, { month: "2-digit", day: "2-digit", hour: "2-digit" });
  return date.toLocaleDateString(locale, { month: "2-digit", day: "2-digit" });
}

function formatCalloutTitle(
  value: Date | number | string,
  labelByTime: Map<number, string>,
  range: Range,
  locale: string,
): string {
  if (value instanceof Date) return labelByTime.get(value.getTime()) ?? formatAxisDate(value, range, locale);
  if (typeof value === "number") return value.toLocaleString(locale);
  return value;
}

function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "-";
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatCount(value: number, locale: string): string {
  return Math.max(0, Math.round(value)).toLocaleString(locale);
}

function colorForSlot(slot: number): string {
  return chartColors[slot % chartColors.length]!;
}
