import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactElement } from "react";
import { redirect } from "react-router";
import { useTranslation } from "react-i18next";
import { curveMonotoneX } from "d3-shape";
import {
  ArrowClockwiseRegular,
  ArrowRepeatAllRegular,
  EyeOffRegular,
  EyeRegular,
  SelectAllOffRegular,
  SelectAllOnRegular,
} from "@fluentui/react-icons";
import type {
  AreaChartProps,
  ChartProps,
  CustomizedCalloutData,
  LineChartProps,
} from "@fluentui/react-charts";

import type { Route } from "./+types/dashboard-monitor-usage";
import type { AuthUser } from "../api/auth";
import { authFetch, callApi } from "../api/auth";
import type { BillingDimension, ControlPlaneModel } from "../api/types";
import { getSessionToken } from "../auth/session";
import { fluentComponents } from "../fluent";
import { PageLoadingPanel } from "../components/page-loading-panel";
import { Panel } from "../components/panel";
import { SegmentedControl } from "../components/segmented-control";
import { useAuthStore } from "../stores/auth-store";
import { useDashboardOutletContext } from "./dashboard";

const { Button, Card, Divider, InteractionTag, InteractionTagPrimary, makeStyles, Spinner, Text, Tooltip } = fluentComponents;

const useErrorStyles = makeStyles({
  root: {
    backgroundColor: "var(--colorPaletteRedBackground2)",
    border: "1px solid var(--colorPaletteRedBorder1)",
    borderRadius: "8px",
    color: "var(--colorPaletteRedForeground1)",
    padding: "10px 12px",
  },
});

const useChartLoadingStyles = makeStyles({
  root: {
    alignItems: "center",
    color: "var(--colorNeutralForeground3)",
    display: "grid",
    fontSize: "13px",
    height: "100%",
    justifyItems: "center",
  },
});

type UsageView = "all-by-user" | "self-by-key";
type Range = "today" | "7d" | "30d";
type Metric =
  | "requests"
  | "cost"
  | "total"
  | "input"
  | "output"
  | "prefill"
  | "cached"
  | "cachedRate"
  | "cacheCreation"
  | "cacheHitRate";

interface DisplayUsageRecord {
  keyId: string;
  keyName?: string;
  keyCreatedAt?: string;
  model: string;
  hour: string;
  requests: number;
  tokens: Partial<Record<BillingDimension, number>>;
  cost: number;
}

interface UsageResponse {
  records: DisplayUsageRecord[];
  keys: Array<{ id: string; name: string; createdAt?: string }>;
}

interface UsageByUserResponse {
  records: Array<{
    userId: number;
    model: string;
    hour: string;
    requests: number;
    tokens: Partial<Record<BillingDimension, number>>;
    cost: number;
  }>;
  users: Array<{ id: number; username: string }>;
}

interface SearchUsageRecord {
  provider: string;
  keyId: string;
  keyName?: string;
  keyCreatedAt?: string;
  hour: string;
  requests: number;
}

interface SearchUsageResponse {
  records: SearchUsageRecord[];
  keys: Array<{ id: string; name: string; createdAt?: string }>;
  activeProvider: string;
}

interface SearchUsageByUserResponse {
  records: Array<{
    provider: string;
    userId: number;
    hour: string;
    requests: number;
  }>;
  users: Array<{ id: number; username: string }>;
  activeProvider: string;
}

interface ModelsResponse {
  object: string;
  data: ControlPlaneModel[];
}

interface UsagePageData {
  user: AuthUser;
  view: UsageView;
  range: Range;
  loadedAt: number;
  usage: UsageResponse;
  search: SearchUsageResponse;
  models: ControlPlaneModel[];
  error: string | null;
}

interface Bucket {
  key: string;
  label: string;
  date: Date;
}

interface TokenSummary {
  requests: number;
  cost: number;
  input: number;
  output: number;
  total: number;
  prefill: number;
  cacheRead: number;
  cacheCreation: number;
}

interface TokenDetail extends TokenSummary {
  inputImage: number;
  outputImage: number;
}

interface ChartEntry {
  id: string;
  label: string;
  colorSlot: number;
}

interface UsageChartModel {
  entries: ChartEntry[];
  data: ChartProps;
  details: Map<string, Map<string, TokenDetail>>;
  buckets: Bucket[];
  kind: "token" | "search";
  range: Range;
  stacked: boolean;
}

type ChartComponents = {
  AreaChart: ComponentType<AreaChartProps>;
  LineChart: ComponentType<LineChartProps>;
};

const palette = [
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

const metricConfig: Record<
  Metric,
  { labelKey: string; kind: "count" | "cost" | "tokens" | "percent" }
> = {
  requests: { labelKey: "dashboard.usage.metrics.requests", kind: "count" },
  cost: { labelKey: "dashboard.usage.metrics.cost", kind: "cost" },
  total: { labelKey: "dashboard.usage.metrics.total", kind: "tokens" },
  input: { labelKey: "dashboard.usage.metrics.input", kind: "tokens" },
  output: { labelKey: "dashboard.usage.metrics.output", kind: "tokens" },
  prefill: { labelKey: "dashboard.usage.metrics.prefill", kind: "tokens" },
  cached: { labelKey: "dashboard.usage.metrics.cached", kind: "tokens" },
  cachedRate: {
    labelKey: "dashboard.usage.metrics.cachedRate",
    kind: "percent",
  },
  cacheCreation: {
    labelKey: "dashboard.usage.metrics.cacheCreation",
    kind: "tokens",
  },
  cacheHitRate: {
    labelKey: "dashboard.usage.metrics.cacheHitRate",
    kind: "percent",
  },
};

const summaryMetrics: Metric[][] = [
  ["requests", "cost"],
  ["total", "output"],
  ["input", "prefill"],
  ["cached", "cachedRate"],
  ["cacheCreation", "cacheHitRate"],
];

const pad2 = (n: number): string => String(n).padStart(2, "0");

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

const toUtcHourParam = (date: Date): string => date.toISOString().slice(0, 13);

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

const dashboardBuckets = (
  range: Range,
  nowMs: number,
  locale: string,
): Bucket[] => {
  if (range === "today") {
    const current = new Date(nowMs);
    current.setMinutes(0, 0, 0);
    return Array.from({ length: 24 }, (_, index) => {
      const date = new Date(current.getTime() - (23 - index) * 3_600_000);
      return { key: localHourKey(date), label: bucketLabel(date, range, locale), date };
    });
  }

  if (range === "7d") {
    const start = local4hBucketStart(new Date(nowMs));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start.getTime() - (41 - index) * 4 * 3_600_000);
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
    start: toUtcHourParam(start),
    end: toUtcHourParam(new Date(now.getTime() + 3_600_000)),
    bucket: range === "today" ? "hour" : range === "7d" ? "4h" : "day",
  };
};

const parseUtcHour = (hour: string): Date => new Date(`${hour}:00:00Z`);

const bucketKeyForUtcHour = (range: Range, hour: string): string => {
  const date = parseUtcHour(hour);
  if (range === "today") return localHourKey(date);
  if (range === "7d") return localHourKey(local4hBucketStart(date));
  return localDateKey(date);
};

const userBucketId = (userId: number): string => `user-${userId}`;

const emptyUsageResponse = (): UsageResponse => ({ records: [], keys: [] });

const emptySearchUsageResponse = (): SearchUsageResponse => ({
  records: [],
  keys: [],
  activeProvider: "disabled",
});

const requestJson = <T,>(path: string, query?: Record<string, string>) => {
  const search = new URLSearchParams(query);
  const url = search.size ? `${path}?${search.toString()}` : path;
  return callApi<T>(() => authFetch(url));
};

const fetchUsageForView = async (
  view: UsageView,
  start: string,
  end: string,
): Promise<{ usage: UsageResponse; search: SearchUsageResponse; error: string | null }> => {
  if (view === "all-by-user") {
    const [usageRes, searchRes] = await Promise.all([
      requestJson<UsageByUserResponse>("/api/token-usage", {
        start,
        end,
        include_user_metadata: "1",
        view,
      }),
      requestJson<SearchUsageByUserResponse>("/api/search-usage", {
        start,
        end,
        include_user_metadata: "1",
        view,
      }),
    ]);

    return {
      usage: usageRes.data
        ? {
            records: usageRes.data.records.map((record) => ({
              keyId: userBucketId(record.userId),
              model: record.model,
              hour: record.hour,
              requests: record.requests,
              tokens: record.tokens,
              cost: record.cost,
            })),
            keys: usageRes.data.users.map((user) => ({
              id: userBucketId(user.id),
              name: user.username,
            })),
          }
        : emptyUsageResponse(),
      search: searchRes.data
        ? {
            records: searchRes.data.records.map((record) => ({
              provider: record.provider,
              keyId: userBucketId(record.userId),
              hour: record.hour,
              requests: record.requests,
            })),
            keys: searchRes.data.users.map((user) => ({
              id: userBucketId(user.id),
              name: user.username,
            })),
            activeProvider: searchRes.data.activeProvider,
          }
        : emptySearchUsageResponse(),
      error: usageRes.error?.message ?? searchRes.error?.message ?? null,
    };
  }

  const [usageRes, searchRes] = await Promise.all([
    requestJson<UsageResponse>("/api/token-usage", {
      start,
      end,
      include_key_metadata: "1",
      view,
    }),
    requestJson<SearchUsageResponse>("/api/search-usage", {
      start,
      end,
      include_key_metadata: "1",
      view,
    }),
  ]);

  return {
    usage: usageRes.data ?? emptyUsageResponse(),
    search: searchRes.data ?? emptySearchUsageResponse(),
    error: usageRes.error?.message ?? searchRes.error?.message ?? null,
  };
};

const fetchModels = async (): Promise<ControlPlaneModel[]> => {
  const result = await requestJson<ModelsResponse>("/api/models");
  return result.data?.data ?? [];
};

const loadUsagePageData = async (
  user: AuthUser,
  view: UsageView,
  range: Range,
  loadedAt: number,
): Promise<Omit<UsagePageData, "user" | "view" | "range" | "loadedAt">> => {
  const { start, end } = dashboardRangeQuery(range, loadedAt);
  const [usageData, models] = await Promise.all([
    fetchUsageForView(view, start, end),
    fetchModels(),
  ]);
  return {
    usage: usageData.usage,
    search: usageData.search,
    models,
    error: usageData.error,
  };
};

export async function clientLoader() {
  if (!getSessionToken()) throw redirect("/");
  return null;
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Usage | Floway" }];
}

export default function DashboardMonitorUsage() {
  const { i18n, t } = useTranslation();
  const { user } = useDashboardOutletContext();
  const clearAuth = useAuthStore((state) => state.clear);
  const initialView: UsageView = user.canViewGlobalTelemetry ? "all-by-user" : "self-by-key";
  const [view, setView] = useState<UsageView>(initialView);
  const [range, setRange] = useState<Range>("today");
  const [loadedRange, setLoadedRange] = useState<Range>("today");
  const [loadedAt, setLoadedAt] = useState(Date.now());
  const [usage, setUsage] = useState(emptyUsageResponse);
  const [search, setSearch] = useState(emptySearchUsageResponse);
  const [models, setModels] = useState<ControlPlaneModel[]>([]);
  const [metric, setMetric] = useState<Metric>("total");
  const [redactKeys, setRedactKeys] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const errorStyles = useErrorStyles();

  const canSwitchView = user.canViewGlobalTelemetry;
  const locale = localeForLanguage(i18n.language);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const requestedView = view;
    const requestedRange = range;
    const requestedAt = Date.now();
    setLoading(true);
    setError(null);

    try {
      const next = await loadUsagePageData(
        user,
        requestedView,
        requestedRange,
        requestedAt,
      );
      if (
        requestId !== requestIdRef.current ||
        requestedView !== view ||
        requestedRange !== range
      ) {
        return;
      }
      setUsage(next.usage);
      setSearch(next.search);
      setModels(next.models);
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
  }, [range, user, view]);

  useEffect(() => {
    void refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (error === "HTTP 401") clearAuth();
  }, [clearAuth, error]);

  const buckets = useMemo(
    () => dashboardBuckets(loadedRange, loadedAt, locale),
    [loadedAt, loadedRange, locale],
  );

  const summary = useMemo(
    () =>
      summarizeUsage(
        usage.records.filter(
          (record) =>
            !hiddenKeys.has(record.keyId) && !hiddenModels.has(record.model),
        ),
      ),
    [hiddenKeys, hiddenModels, usage.records],
  );

  const byKeyChart = useMemo(
    () =>
      buildTokenChart({
        records: usage.records,
        metadata: usage.keys,
        models,
        groupKey: "keyId",
        hiddenOwn: hiddenKeys,
        hiddenOther: hiddenModels,
        redactKeys,
        metric,
        range: loadedRange,
        buckets,
      }),
    [
      buckets,
      hiddenKeys,
      hiddenModels,
      loadedRange,
      metric,
      models,
      redactKeys,
      usage.keys,
      usage.records,
    ],
  );

  const byModelChart = useMemo(
    () =>
      buildTokenChart({
        records: usage.records,
        metadata: usage.keys,
        models,
        groupKey: "model",
        hiddenOwn: hiddenModels,
        hiddenOther: hiddenKeys,
        redactKeys,
        metric,
        range: loadedRange,
        buckets,
      }),
    [
      buckets,
      hiddenKeys,
      hiddenModels,
      loadedRange,
      metric,
      models,
      redactKeys,
      usage.keys,
      usage.records,
    ],
  );

  const searchChart = useMemo(
    () =>
      buildSearchChart({
        search,
        hiddenKeys,
        redactKeys,
        range: loadedRange,
        buckets,
      }),
    [buckets, hiddenKeys, loadedRange, redactKeys, search],
  );

  const activeProvider = search.activeProvider ?? "disabled";
  const showSearch = activeProvider !== "disabled";
  const chartTitle =
    view === "all-by-user"
      ? t("dashboard.usage.charts.byUser")
      : t("dashboard.usage.charts.byKey");

  return (
    <section className="grid gap-[18px] min-w-0">
      <header className="flex items-start justify-between gap-[18px] min-w-0">
        <div className="grid gap-[6px] min-w-0">
          <Text size={200} weight="semibold" className="text-fui-fg2 leading-[1.2] uppercase">
            {t("dashboard.groups.monitor")}
          </Text>
          <Text size={700} weight="semibold">
            {t("dashboard.nav.usage")}
          </Text>
          <Text size={300} className="text-fui-fg2 leading-[1.45] max-w-[760px]">
            {t("dashboard.pages.usage")}
          </Text>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {loading && !initialLoading && <Spinner size="tiny" label={t("dashboard.usage.refreshing")} />}
          <Tooltip
            content={t("dashboard.usage.actions.refresh")}
            relationship="label"
          >
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
        <div className="flex items-center gap-3 justify-between min-w-0 max-[900px]:flex-col max-[900px]:items-stretch">
          <div className="flex items-center flex-wrap gap-2.5 min-w-0">
            <Text size={200} weight="semibold" className="text-fui-fg3 leading-[1.2]">
              {t("dashboard.usage.tokenUsage")}
            </Text>
            {canSwitchView && (
              <SegmentedControl
                ariaLabel={t("dashboard.usage.view.label")}
                items={[
                  {
                    value: "all-by-user",
                    label: t("dashboard.usage.view.allByUser"),
                  },
                  {
                    value: "self-by-key",
                    label: t("dashboard.usage.view.myKeys"),
                  },
                ]}
                onChange={(value) => setView(value as UsageView)}
                value={view}
              />
            )}
            <Tooltip
              content={
                view === "all-by-user"
                  ? t("dashboard.usage.actions.redactUsers")
                  : t("dashboard.usage.actions.redactKeys")
              }
              relationship="label"
            >
              <Button
                appearance={redactKeys ? "primary" : "subtle"}
                icon={redactKeys ? <EyeOffRegular /> : <EyeRegular />}
                onClick={() => setRedactKeys((value) => !value)}
              />
            </Tooltip>
          </div>

          <SegmentedControl
            ariaLabel={t("dashboard.usage.range.label")}
            items={[
              { value: "today", label: t("dashboard.usage.range.today") },
              { value: "7d", label: t("dashboard.usage.range.sevenDays") },
              { value: "30d", label: t("dashboard.usage.range.thirtyDays") },
            ]}
            onChange={(value) => setRange(value as Range)}
            value={range}
          />
        </div>

        <UsageChartSection
          chart={byKeyChart}
          detailsLabel={chartTitle}
          hidden={hiddenKeys}
          onHiddenChange={setHiddenKeys}
          title={chartTitle}
          valueFormatter={(value) => formatMetricValue(value, metric, locale)}
        />

        <Divider appearance="subtle" />

        <UsageChartSection
          chart={byModelChart}
          detailsLabel={t("dashboard.usage.charts.byModel")}
          hidden={hiddenModels}
          onHiddenChange={setHiddenModels}
          title={t("dashboard.usage.charts.byModel")}
          valueFormatter={(value) => formatMetricValue(value, metric, locale)}
        />

        <div className="grid gap-2.5 grid-cols-5 max-[900px]:grid-cols-2 max-[520px]:grid-cols-1">
          {summaryMetrics.map((group) => (
            <div className="grid gap-2 min-w-0" key={group.join("-")}>
              {group.map((summaryMetric) => (
                <SummaryMetricButton
                  active={metric === summaryMetric}
                  key={summaryMetric}
                  label={t(metricConfig[summaryMetric].labelKey)}
                  onClick={() => setMetric(summaryMetric)}
                  value={formatSummaryMetric(summary, summaryMetric, locale)}
                />
              ))}
            </div>
          ))}
        </div>

      </Panel>

      {showSearch && (
        <Panel className="!grid gap-[18px] min-w-0 !p-[18px]">
          <UsageChartSection
            chart={searchChart}
            detailsLabel={t("dashboard.usage.charts.search")}
            hidden={hiddenKeys}
            onHiddenChange={setHiddenKeys}
            title={t("dashboard.usage.charts.searchWithProvider", {
              provider: formatProvider(activeProvider),
            })}
            valueFormatter={(value) => formatCount(value, locale)}
          />
        </Panel>
      )}
        </>
      )}
    </section>
  );
}

const useMetricButtonStyles = makeStyles({
  root: {
    backgroundColor: "var(--colorNeutralBackground2)",
    border: "1px solid var(--colorNeutralStroke1)",
    borderRadius: "8px",
    cursor: "pointer",
    display: "grid",
    gap: "4px",
    minHeight: "66px",
    minWidth: "0",
    padding: "8px 10px",
    textAlign: "left",
    ":hover": {
      border: "1px solid var(--colorBrandStroke1)",
    },
  },
  activeRoot: {
    backgroundColor: "var(--colorBrandBackgroundInvertedHover)",
    border: "1px solid var(--colorBrandStroke1)",
    "@media (prefers-color-scheme: dark)": {
      backgroundColor: "var(--colorBrandBackground2)",
    },
  },
  value: {
    color: "var(--colorNeutralForeground1)",
    overflowWrap: "anywhere",
  },
  activeText: {
    color: "var(--colorBrandForeground1)",
  },
});

function SummaryMetricButton({
  active,
  label,
  onClick,
  value,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  value: string;
}) {
  const s = useMetricButtonStyles();
  return (
    <button
      aria-pressed={active}
      className={`${s.root} ${active ? s.activeRoot : ""}`}
      onClick={onClick}
      type="button"
    >
      <Text size={200} weight="semibold" className={`text-fui-fg2 leading-[1.2] ${active ? s.activeText : ""}`}>
        {label}
      </Text>
      <Text size={500} weight="semibold" className={`${s.value} ${active ? s.activeText : ""}`}>
        {value}
      </Text>
    </button>
  );
}

function UsageChartSection({
  chart,
  detailsLabel,
  hidden,
  onHiddenChange,
  title,
  valueFormatter,
}: {
  chart: UsageChartModel;
  detailsLabel: string;
  hidden: Set<string>;
  onHiddenChange: (next: Set<string>) => void;
  title: string;
  valueFormatter: (value: number) => string;
}) {
  const { t } = useTranslation();
  const ids = chart.entries.map((entry) => entry.id);
  const visibleLegends = chart.entries
    .filter((entry) => !hidden.has(entry.id))
    .map((entry) => entry.label);

  return (
    <section className="grid gap-3 min-w-0">
      <div className="flex items-center gap-3 justify-between min-w-0 max-[900px]:flex-col max-[900px]:items-stretch">
        <Text size={400} weight="semibold" className="text-fui-fg1 leading-[1.25]">{title}</Text>
        <div className="flex items-center flex-none gap-1" aria-label={detailsLabel}>
          <Tooltip content={t("dashboard.usage.series.all")} relationship="label">
            <Button
              appearance="subtle"
              icon={<SelectAllOnRegular />}
              onClick={() => onHiddenChange(new Set())}
            />
          </Tooltip>
          <Tooltip
            content={t("dashboard.usage.series.invert")}
            relationship="label"
          >
            <Button
              appearance="subtle"
              icon={<ArrowRepeatAllRegular />}
              onClick={() =>
                onHiddenChange(new Set(ids.filter((id) => !hidden.has(id))))
              }
            />
          </Tooltip>
          <Tooltip content={t("dashboard.usage.series.none")} relationship="label">
            <Button
              appearance="subtle"
              icon={<SelectAllOffRegular />}
              onClick={() => onHiddenChange(new Set(ids))}
            />
          </Tooltip>
        </div>
      </div>

      <ChartLegend
        entries={chart.entries}
        hidden={hidden}
        onHiddenChange={onHiddenChange}
      />

      <ChartCard>
        <FluentUsageChart chart={chart} valueFormatter={valueFormatter} visibleLegends={visibleLegends} />
      </ChartCard>
    </section>
  );
}

function ChartLegend({
  entries,
  hidden,
  onHiddenChange,
}: {
  entries: ChartEntry[];
  hidden: Set<string>;
  onHiddenChange: (next: Set<string>) => void;
}) {
  const { t } = useTranslation();

  if (!entries.length) {
    return <Text size={200} className="text-fui-fg2">{t("dashboard.usage.empty")}</Text>;
  }

  return (
    <div className="flex flex-wrap gap-[6px] min-w-0">
      {entries.map((entry) => (
        <LegendTag
          key={entry.id}
          entry={entry}
          isHidden={hidden.has(entry.id)}
          onToggle={(exclusive) => {
            if (exclusive) {
              onHiddenChange(
                new Set(entries.map((item) => item.id).filter((id) => id !== entry.id)),
              );
              return;
            }
            const next = new Set(hidden);
            if (next.has(entry.id)) next.delete(entry.id);
            else next.add(entry.id);
            onHiddenChange(next);
          }}
          toggleHint={t("dashboard.usage.series.toggleHint")}
        />
      ))}
    </div>
  );
}

function LegendTag({
  entry,
  isHidden,
  onToggle,
  toggleHint,
}: {
  entry: ChartEntry;
  isHidden: boolean;
  onToggle: (exclusive: boolean) => void;
  toggleHint: string;
}) {
  return (
    <InteractionTag
      appearance="outline"
      shape="circular"
      size="small"
    >
      <InteractionTagPrimary
        className={isHidden ? "line-through opacity-[0.55]" : ""}
        icon={
          <span
            aria-hidden="true"
            className="inline-block rounded-full h-[8px] w-[8px] mx-[4px] flex-shrink-0"
            style={{ backgroundColor: colorForSlot(entry.colorSlot) }}
          />
        }
        onClick={(event) => onToggle(event.shiftKey)}
        onDoubleClick={() => onToggle(true)}
        title={toggleHint}
      >
        {entry.label}
      </InteractionTagPrimary>
    </InteractionTag>
  );
}

const useChartCardStyles = makeStyles({
  root: {
    "&::after": {
      borderRadius: "8px",
    },
  },
});

function ChartCard({ children }: { children: React.ReactNode }) {
  const styles = useChartCardStyles();
  return (
    <Card
      appearance="outline"
      className={`${styles.root} !rounded-lg min-h-[320px] min-w-0 overflow-hidden`}
    >
      {children}
    </Card>
  );
}

function FluentUsageChart({
  chart,
  valueFormatter,
  visibleLegends,
}: {
  chart: UsageChartModel;
  valueFormatter: (value: number) => string;
  visibleLegends: string[];
}) {
  const { i18n, t } = useTranslation();
  const chartLoadingStyles = useChartLoadingStyles();
  const [components, setComponents] = useState<ChartComponents | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const size = useElementSize(host);
  const locale = localeForLanguage(i18n.language);
  const labelByTime = useMemo(
    () =>
      new Map(
        chart.buckets.map((bucket) => [bucket.date.getTime(), bucket.label]),
      ),
    [chart.buckets],
  );
  const tickValues = useMemo(
    () => chartTickValues(chart.buckets).map((bucket) => bucket.date),
    [chart.buckets],
  );
  const dateFormatter = useCallback(
    (date: Date) => formatAxisDate(date, chart.range, locale),
    [chart.range, locale],
  );

  useEffect(() => {
    let disposed = false;
    void import("@fluentui/react-charts").then((module) => {
      if (!disposed) {
        setComponents({
          AreaChart: module.AreaChart,
          LineChart: module.LineChart,
        });
      }
    });
    return () => {
      disposed = true;
    };
  }, []);

  const callout = useCallback(
    (props?: CustomizedCalloutData): ReactElement | null => {
      if (!props?.values.length) return null;
      const bucketKey = bucketKeyForCallout(props.x, chart.buckets);
      const bucketDetails = bucketKey ? chart.details.get(bucketKey) : undefined;
      const rows = props.values
        .filter((item) => item.y > 0)
        .sort((a, b) => b.y - a.y);

      return (
        <div className="grid gap-[6px] max-w-[min(760px,calc(100vw-48px))] min-w-[220px] overflow-x-auto p-1">
          <Text size={200} weight="semibold">
            {formatCalloutTitle(props.x, labelByTime, chart.range, locale)}
          </Text>
          {chart.kind === "token" && bucketDetails ? (
            <table className="border-collapse whitespace-nowrap">
              <thead>
                <tr>
                  <th className="max-w-[180px] min-w-[120px] pl-0 text-left" />
                  <th className="px-2 py-[2px] text-right"><Text size={100} weight="semibold" className="text-fui-fg2">Req</Text></th>
                  <th className="px-2 py-[2px] text-right"><Text size={100} weight="semibold" className="text-fui-fg2">Cost</Text></th>
                  <th className="px-2 py-[2px] text-right"><Text size={100} weight="semibold" className="text-fui-fg2">Total</Text></th>
                  <th className="px-2 py-[2px] text-right"><Text size={100} weight="semibold" className="text-fui-fg2">Cached</Text></th>
                  <th className="px-2 py-[2px] text-right"><Text size={100} weight="semibold" className="text-fui-fg2">Cached%</Text></th>
                  <th className="px-2 py-[2px] text-right"><Text size={100} weight="semibold" className="text-fui-fg2">Prefill</Text></th>
                  <th className="px-2 py-[2px] text-right"><Text size={100} weight="semibold" className="text-fui-fg2">Output</Text></th>
                  <th className="px-2 py-[2px] text-right"><Text size={100} weight="semibold" className="text-fui-fg2">Hit%</Text></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const entry = chart.entries.find((candidate) => candidate.label === item.legend);
                  const detail = entry ? bucketDetails.get(entry.id) : undefined;
                  if (!detail) return null;
                  const prompt =
                    detail.input +
                    detail.cacheRead +
                    detail.cacheCreation +
                    detail.inputImage;
                  const output = detail.output + detail.outputImage;
                  const total = prompt + output;
                  const prefill = detail.input + detail.cacheCreation + detail.inputImage;
                  return (
                    <tr key={item.legend}>
                      <td className="max-w-[180px] min-w-[120px] pl-0 text-left">
                        <span className="flex items-center gap-[6px] min-w-0 overflow-hidden text-ellipsis">
                          <i className="rounded-[2px] h-[10px] w-[10px] flex-shrink-0" style={{ backgroundColor: item.color }} />
                          <Text size={200}>{item.legend}</Text>
                        </span>
                      </td>
                      <td className="px-2 py-[2px] text-right"><Text size={200}>{formatCount(detail.requests, locale)}</Text></td>
                      <td className="px-2 py-[2px] text-right"><Text size={200}>{formatCost(detail.cost)}</Text></td>
                      <td className="px-2 py-[2px] text-right"><Text size={200}>{formatTokenCount(total, locale)}</Text></td>
                      <td className="px-2 py-[2px] text-right"><Text size={200}>{formatTokenCount(detail.cacheRead, locale)}</Text></td>
                      <td className="px-2 py-[2px] text-right"><Text size={200}>{formatInputRate(detail.cacheRead, prompt)}</Text></td>
                      <td className="px-2 py-[2px] text-right"><Text size={200}>{formatTokenCount(prefill, locale)}</Text></td>
                      <td className="px-2 py-[2px] text-right"><Text size={200}>{formatTokenCount(output, locale)}</Text></td>
                      <td className="px-2 py-[2px] text-right"><Text size={200}>{formatHitRate(detail.cacheRead, detail.cacheCreation)}</Text></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            rows.map((item) => (
              <Text key={item.legend} size={200} className="flex items-center gap-1.5 justify-between font-mono">
                <i className="rounded-full h-[8px] w-[8px] flex-shrink-0" style={{ backgroundColor: item.color }} />
                {item.legend}: {valueFormatter(item.y)}
              </Text>
            ))
          )}
        </div>
      );
    },
    [chart.buckets, chart.details, chart.entries, chart.kind, chart.range, labelByTime, locale, valueFormatter],
  );

  return (
    <div className="h-[320px] min-w-0 w-full" ref={setHost}>
      {!components || size.width < 120 ? (
        <div className={chartLoadingStyles.root}>{t("dashboard.usage.loading")}</div>
      ) : chart.data.lineChartData?.length ? (
        chart.stacked ? (
          <components.AreaChart
            data={chart.data}
            height={size.height}
            hideLegend
            legendProps={{
              selectedLegends: visibleLegends,
              canSelectMultipleLegends: true,
            }}
            margins={{ top: 16, right: 20, bottom: 42, left: 54 }}
            mode="tonexty"
            onRenderCalloutPerStack={callout}
            tickValues={tickValues}
            width={size.width}
            customDateTimeFormatter={dateFormatter}
            yAxisTickFormat={valueFormatter}
            yMinValue={0}
          />
        ) : (
          <components.LineChart
            data={chart.data}
            height={size.height}
            hideLegend
            legendProps={{
              selectedLegends: visibleLegends,
              canSelectMultipleLegends: true,
            }}
            margins={{ top: 16, right: 20, bottom: 42, left: 54 }}
            onRenderCalloutPerStack={callout}
            tickValues={tickValues}
            width={size.width}
            customDateTimeFormatter={dateFormatter}
            yAxisTickFormat={valueFormatter}
            yMaxValue={100}
            yMinValue={0}
          />
        )
      ) : (
        <div className={chartLoadingStyles.root}>{t("dashboard.usage.empty")}</div>
      )}
    </div>
  );
}

function useElementSize(element: HTMLElement | null) {
  const [size, setSize] = useState({ width: 0, height: 320 });

  useEffect(() => {
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(260, Math.floor(rect.height)),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return size;
}

function buildTokenChart({
  records,
  metadata,
  models,
  groupKey,
  hiddenOwn,
  hiddenOther,
  redactKeys,
  metric,
  range,
  buckets,
}: {
  records: DisplayUsageRecord[];
  metadata: UsageResponse["keys"];
  models: ControlPlaneModel[];
  groupKey: "keyId" | "model";
  hiddenOwn: Set<string>;
  hiddenOther: Set<string>;
  redactKeys: boolean;
  metric: Metric;
  range: Range;
  buckets: Bucket[];
}): UsageChartModel {
  const otherKey = groupKey === "keyId" ? "model" : "keyId";
  const valueRecords = records.filter((record) => !hiddenOther.has(record[otherKey]));
  const { values, details } = aggregateTokenRecords(valueRecords, groupKey, metric, range, buckets);
  const presentGroups = new Set(records.map((record) => record[groupKey]));
  const entries =
    groupKey === "keyId"
      ? keyChartEntries([...presentGroups], metadata, records, redactKeys)
      : modelChartEntries([...presentGroups], models);

  const visibleEntries = entries.filter((entry) => !hiddenOwn.has(entry.id));
  const isPercent = metricConfig[metric].kind === "percent";
  const series = visibleEntries
    .map((entry) => ({
      entry,
      data: buckets.map((bucket) => values.get(bucket.key)?.get(entry.id) ?? 0),
    }))
    .filter(({ data, entry }) =>
      isPercent
        ? data.some((value) => value > 0)
        : data.some((value) => value > 0) || hasRequests(details, entry.id),
    );

  return {
    entries,
    buckets,
    details,
    kind: "token",
    range,
    stacked: !isPercent,
    data: {
      chartTitle: "",
      lineChartData: series.map(({ entry, data }) => ({
        legend: entry.label,
        color: colorForSlot(entry.colorSlot),
        lineOptions: { strokeWidth: 2, curve: curveMonotoneX },
        data: data.map((value, index) => ({
          x: buckets[index]!.date,
          y: value,
          xAxisCalloutData: buckets[index]!.label,
          yAxisCalloutData: String(value),
        })),
      })),
    },
  };
}

function buildSearchChart({
  search,
  hiddenKeys,
  redactKeys,
  range,
  buckets,
}: {
  search: SearchUsageResponse;
  hiddenKeys: Set<string>;
  redactKeys: boolean;
  range: Range;
  buckets: Bucket[];
}): UsageChartModel {
  const groups = new Map<string, Map<string, number>>();
  const presentGroups = new Set<string>();
  const meta = new Map<string, { name?: string; createdAt?: string }>();
  for (const key of search.keys) meta.set(key.id, { name: key.name, createdAt: key.createdAt });

  for (const record of search.records) {
    if (record.provider !== search.activeProvider) continue;
    presentGroups.add(record.keyId);
    meta.set(record.keyId, {
      name: record.keyName ?? meta.get(record.keyId)?.name,
      createdAt: record.keyCreatedAt ?? meta.get(record.keyId)?.createdAt,
    });
    const bucket = bucketKeyForUtcHour(range, record.hour);
    const bucketValues = groups.get(record.keyId) ?? new Map<string, number>();
    bucketValues.set(bucket, (bucketValues.get(bucket) ?? 0) + record.requests);
    groups.set(record.keyId, bucketValues);
  }

  const entries = keyChartEntries(
    [...presentGroups],
    search.keys,
    search.records.map((record) => ({
      keyId: record.keyId,
      keyName: record.keyName,
      keyCreatedAt: record.keyCreatedAt,
      model: "",
      hour: record.hour,
      requests: record.requests,
      tokens: {},
      cost: 0,
    })),
    redactKeys,
  );
  const visibleEntries = entries.filter((entry) => !hiddenKeys.has(entry.id));
  const details = new Map<string, Map<string, TokenDetail>>();
  for (const bucket of buckets) details.set(bucket.key, new Map());

  return {
    entries,
    buckets,
    details,
    kind: "search",
    range,
    stacked: true,
    data: {
      chartTitle: "",
      lineChartData: visibleEntries.map((entry) => ({
        legend: entry.label,
        color: colorForSlot(entry.colorSlot),
        lineOptions: { strokeWidth: 2, curve: curveMonotoneX },
        data: buckets.map((bucket) => ({
          x: bucket.date,
          y: groups.get(entry.id)?.get(bucket.key) ?? 0,
          xAxisCalloutData: bucket.label,
        })),
      })),
    },
  };
}

function aggregateTokenRecords(
  records: DisplayUsageRecord[],
  groupKey: "keyId" | "model",
  metric: Metric,
  range: Range,
  buckets: Bucket[],
) {
  const values = new Map<string, Map<string, number>>();
  const details = new Map<string, Map<string, TokenDetail>>();
  for (const bucket of buckets) {
    values.set(bucket.key, new Map());
    details.set(bucket.key, new Map());
  }

  for (const record of records) {
    const bucket = bucketKeyForUtcHour(range, record.hour);
    if (!values.has(bucket)) continue;

    const group = record[groupKey];
    const bucketDetails = details.get(bucket)!;
    const detail = bucketDetails.get(group) ?? emptyDetail();
    addRecordToDetail(detail, record);
    bucketDetails.set(group, detail);

    if (metricConfig[metric].kind !== "percent") {
      const bucketValues = values.get(bucket)!;
      bucketValues.set(group, (bucketValues.get(group) ?? 0) + metricValue(record, metric));
    }
  }

  if (metricConfig[metric].kind === "percent") {
    for (const [bucket, bucketDetails] of details) {
      const bucketValues = values.get(bucket)!;
      for (const [group, detail] of bucketDetails) {
        bucketValues.set(group, tokenDetailMetricValue(detail, metric) ?? 0);
      }
    }
  }

  return { values, details };
}

function keyChartEntries(
  presentKeyIds: string[],
  metadata: UsageResponse["keys"],
  records: DisplayUsageRecord[],
  redactKeys: boolean,
): ChartEntry[] {
  const meta = new Map<string, { name?: string; createdAt?: string }>();
  for (const key of metadata) meta.set(key.id, { name: key.name, createdAt: key.createdAt });
  for (const record of records) {
    const prev = meta.get(record.keyId);
    meta.set(record.keyId, {
      name: record.keyName ?? prev?.name,
      createdAt: record.keyCreatedAt ?? prev?.createdAt,
    });
  }

  const orderedIds = metadata.map((key) => key.id);
  const slotById = new Map<string, number>(orderedIds.map((id, index) => [id, index]));
  [...new Set(presentKeyIds)]
    .filter((id) => !slotById.has(id))
    .sort()
    .forEach((id, index) => slotById.set(id, orderedIds.length + index));

  return [...new Set(presentKeyIds)]
    .map((id) => ({
      id,
      label: redactKeys ? id.slice(0, 6) : meta.get(id)?.name ?? id.slice(0, 8),
      colorSlot: slotById.get(id) ?? 0,
    }))
    .sort((a, b) => a.colorSlot - b.colorSlot);
}

function modelChartEntries(
  presentModelIds: string[],
  models: ControlPlaneModel[],
): ChartEntry[] {
  const present = new Set(presentModelIds);
  return [...new Set([...models.map((model) => model.id), ...presentModelIds])]
    .sort()
    .map((id, colorSlot) => ({ id, label: id, colorSlot }))
    .filter((entry) => present.has(entry.id));
}

function summarizeUsage(records: DisplayUsageRecord[]): TokenSummary {
  const summary = emptyDetail();
  for (const record of records) addRecordToDetail(summary, record);
  return {
    requests: summary.requests,
    cost: summary.cost,
    cacheRead: summary.cacheRead,
    cacheCreation: summary.cacheCreation,
    input: summary.input + summary.cacheRead + summary.cacheCreation + summary.inputImage,
    output: summary.output + summary.outputImage,
    total:
      summary.input +
      summary.output +
      summary.cacheRead +
      summary.cacheCreation +
      summary.inputImage +
      summary.outputImage,
    prefill: summary.input + summary.cacheCreation + summary.inputImage,
  };
}

function addRecordToDetail(detail: TokenDetail, record: DisplayUsageRecord) {
  detail.requests += record.requests;
  detail.cost += record.cost;
  detail.input += dim(record, "input");
  detail.output += dim(record, "output");
  detail.cacheRead += dim(record, "input_cache_read");
  detail.cacheCreation += dim(record, "input_cache_write") + dim(record, "input_cache_write_1h");
  detail.inputImage += dim(record, "input_image");
  detail.outputImage += dim(record, "output_image");
}

function emptyDetail(): TokenDetail {
  return {
    requests: 0,
    cost: 0,
    input: 0,
    output: 0,
    total: 0,
    prefill: 0,
    cacheRead: 0,
    cacheCreation: 0,
    inputImage: 0,
    outputImage: 0,
  };
}

function dim(record: DisplayUsageRecord, key: BillingDimension): number {
  return record.tokens[key] ?? 0;
}

function metricValue(record: DisplayUsageRecord, metric: Metric): number {
  switch (metric) {
    case "requests":
      return record.requests;
    case "cost":
      return record.cost;
    case "total":
      return (
        dim(record, "input") +
        dim(record, "output") +
        dim(record, "input_cache_read") +
        dim(record, "input_cache_write") +
        dim(record, "input_cache_write_1h") +
        dim(record, "input_image") +
        dim(record, "output_image")
      );
    case "input":
      return (
        dim(record, "input") +
        dim(record, "input_cache_read") +
        dim(record, "input_cache_write") +
        dim(record, "input_cache_write_1h") +
        dim(record, "input_image")
      );
    case "output":
      return dim(record, "output") + dim(record, "output_image");
    case "prefill":
      return dim(record, "input") + dim(record, "input_cache_write") + dim(record, "input_cache_write_1h") + dim(record, "input_image");
    case "cached":
      return dim(record, "input_cache_read");
    case "cacheCreation":
      return dim(record, "input_cache_write") + dim(record, "input_cache_write_1h");
    case "cachedRate":
    case "cacheHitRate":
      return 0;
  }
}

function tokenDetailMetricValue(detail: TokenDetail, metric: Metric): number | null {
  if (metric === "cacheHitRate") {
    const total = detail.cacheRead + detail.cacheCreation;
    return total > 0 ? (detail.cacheRead / total) * 100 : null;
  }
  if (metric === "cachedRate") {
    const prompt = detail.input + detail.cacheRead + detail.cacheCreation + detail.inputImage;
    return prompt > 0 ? (detail.cacheRead / prompt) * 100 : null;
  }
  return null;
}

function hasRequests(details: Map<string, Map<string, TokenDetail>>, id: string): boolean {
  for (const bucket of details.values()) {
    if ((bucket.get(id)?.requests ?? 0) > 0) return true;
  }
  return false;
}

function colorForSlot(slot: number): string {
  return palette[slot % palette.length]!;
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
  if (range === "today") {
    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (range === "7d") {
    return date.toLocaleDateString(locale, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    });
  }
  return date.toLocaleDateString(locale, {
    month: "2-digit",
    day: "2-digit",
  });
}

function formatCalloutTitle(
  value: Date | number | string,
  labelByTime: Map<number, string>,
  range: Range,
  locale: string,
): string {
  if (value instanceof Date) {
    return labelByTime.get(value.getTime()) ?? formatAxisDate(value, range, locale);
  }
  if (typeof value === "number") return value.toLocaleString(locale);
  return value;
}

function bucketKeyForCallout(
  value: Date | number | string,
  buckets: Bucket[],
): string | null {
  if (value instanceof Date) {
    return (
      buckets.find((bucket) => bucket.date.getTime() === value.getTime())?.key ??
      null
    );
  }
  return null;
}

function formatCount(value: number, locale: string): string {
  return Math.round(value).toLocaleString(locale);
}

function formatTokenCount(value: number, locale: string): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return Math.round(value).toLocaleString(locale);
}

function formatCost(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  if (value > 0) return `$${value.toFixed(4)}`;
  return "$0";
}

function formatInputRate(cached: number, input: number): string {
  if (input <= 0) return "-";
  return `${((cached / input) * 100).toFixed(1)}%`;
}

function formatHitRate(cached: number, created: number): string {
  const denom = cached + created;
  if (denom <= 0) return "-";
  return `${((cached / denom) * 100).toFixed(1)}%`;
}

function formatSummaryMetric(
  summary: TokenSummary,
  metric: Metric,
  locale: string,
): string {
  switch (metric) {
    case "requests":
      return formatCount(summary.requests, locale);
    case "cost":
      return formatCost(summary.cost);
    case "total":
      return formatCount(summary.total, locale);
    case "input":
      return formatCount(summary.input, locale);
    case "output":
      return formatCount(summary.output, locale);
    case "prefill":
      return formatCount(summary.prefill, locale);
    case "cached":
      return formatCount(summary.cacheRead, locale);
    case "cacheCreation":
      return formatCount(summary.cacheCreation, locale);
    case "cachedRate":
      return formatInputRate(summary.cacheRead, summary.input);
    case "cacheHitRate":
      return formatHitRate(summary.cacheRead, summary.cacheCreation);
  }
}

function formatMetricValue(value: number, metric: Metric, locale: string): string {
  const kind = metricConfig[metric].kind;
  if (kind === "percent") return `${value.toFixed(0)}%`;
  if (kind === "cost") return formatCost(value);
  if (kind === "count") return formatCount(value, locale);
  return formatTokenCount(value, locale);
}

function formatProvider(provider: string): string {
  if (provider === "microsoft-grounding") return "Microsoft Grounding";
  if (provider === "tavily") return "Tavily";
  if (provider === "jina") return "Jina";
  return provider;
}
