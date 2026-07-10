import { useCallback, useEffect, useState } from "react";
import { redirect } from "react-router";
import { useTranslation } from "react-i18next";
import {
  AddRegular,
  ArrowSyncRegular,
  DeleteRegular,
} from "@fluentui/react-icons";

import { DEFAULT_DIAL_DEADLINE_MS } from "@floway-dev/proxy/constants";
import type {
  HttpProxyConfig,
  ProxyConfig,
  RealityProxyConfig,
  Shadowsocks2022ProxyConfig,
  ShadowsocksProxyConfig,
  Socks5ProxyConfig,
  TrojanProxyConfig,
  VlessTcpTlsProxyConfig,
  VlessWsTlsProxyConfig,
} from "@floway-dev/proxy/proxy-config";
import { formatProxyUri, parseProxyUri } from "@floway-dev/proxy/url";
import { kindFromUri } from "@floway-dev/proxy/url-kind";

import type { Route } from "./+types/dashboard-providers-proxy";
import type { BackoffRow, ProxyConflictBody, ProxyRecord } from "../api/types";
import { authFetch, callApi } from "../api/auth";
import { getSessionToken } from "../auth/session";
import { ConfirmDialog } from "../components/confirm-dialog";
import { PageLoadingPanel } from "../components/page-loading-panel";
import { Panel } from "../components/panel";
import { fluentComponents } from "../fluent";
import { useDashboardOutletContext } from "./dashboard";

const {
  Button,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Tooltip,
} = fluentComponents;

// ---------------------------------------------------------------------------
// clientLoader / meta
// ---------------------------------------------------------------------------

export async function clientLoader() {
  if (!getSessionToken()) throw redirect("/");
  return null;
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Proxy | Floway" }];
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const DEFAULT_DIAL_TIMEOUT_SECONDS = Math.floor(DEFAULT_DIAL_DEADLINE_MS / 1000);

function ProxyPageHeader() {
  const { t } = useTranslation();

  return (
    <header className="grid gap-[6px]">
      <Text
        size={200}
        weight="semibold"
        className="text-fui-fg2 leading-[1.2] uppercase"
      >
        {t("dashboard.groups.providers")}
      </Text>
      <Text size={700} weight="semibold">
        {t("dashboard.proxy.heading")}
      </Text>
      <Text size={300} className="text-fui-fg2 leading-[1.45] max-w-[760px]">
        {t("dashboard.proxy.description")}
      </Text>
    </header>
  );
}

type FormKind =
  | "http" | "https"
  | "socks5"
  | "ss" | "ss2022"
  | "trojan"
  | "vless-tcp" | "vless-ws"
  | "reality";

const FORM_KIND_LABELS: Record<FormKind, string> = {
  "http": "HTTP",
  "https": "HTTPS",
  "socks5": "SOCKS5",
  "ss": "Shadowsocks",
  "ss2022": "Shadowsocks 2022",
  "trojan": "Trojan",
  "vless-tcp": "VLESS / TLS",
  "vless-ws": "VLESS / WebSocket",
  "reality": "VLESS / REALITY",
};

const KIND_OPTIONS = (Object.keys(FORM_KIND_LABELS) as FormKind[]).map(
  (value) => ({ value, label: FORM_KIND_LABELS[value] }),
);

const SS_METHOD_OPTIONS = [
  { value: "aes-128-gcm" as const, label: "aes-128-gcm" },
  { value: "aes-256-gcm" as const, label: "aes-256-gcm" },
  { value: "chacha20-ietf-poly1305" as const, label: "chacha20-ietf-poly1305" },
];

const SS2022_METHOD_OPTIONS = [
  { value: "2022-blake3-aes-128-gcm" as const, label: "2022-blake3-aes-128-gcm" },
  { value: "2022-blake3-aes-256-gcm" as const, label: "2022-blake3-aes-256-gcm" },
  { value: "2022-blake3-chacha20-poly1305" as const, label: "2022-blake3-chacha20-poly1305" },
];

const defaultsFor = (
  kind: FormKind,
  ctx: { host: string; port: number; name: string },
): ProxyConfig => {
  const port =
    ctx.port > 0
      ? ctx.port
      : ((k: FormKind) => {
          switch (k) {
            case "http": return 8080;
            case "https": case "trojan": case "vless-tcp": case "vless-ws": case "reality": return 443;
            case "socks5": return 1080;
            case "ss": case "ss2022": return 8388;
          }
        })(kind);
  const base = { host: ctx.host, port, name: ctx.name };
  switch (kind) {
    case "http": return { kind: "http", tls: false, ...base };
    case "https": return { kind: "http", tls: true, ...base };
    case "socks5": return { kind: "socks5", ...base };
    case "ss": return { kind: "ss", method: "aes-256-gcm" as const, password: "", ...base };
    case "ss2022": return { kind: "ss2022", method: "2022-blake3-aes-128-gcm" as const, passwordBase64: "", ...base };
    case "trojan": return { kind: "trojan", password: "", ...base };
    case "vless-tcp": return { kind: "vless-tcp", uuid: "", ...base };
    case "vless-ws": return { kind: "vless-ws", uuid: "", path: "/", ...base };
    case "reality": return { kind: "reality", uuid: "", publicKey: "", serverName: "", ...base };
  }
};

const formKindFromConfig = (c: ProxyConfig): FormKind => {
  if (c.kind === "http") return c.tls ? "https" : "http";
  return c.kind;
};

const isValidPort = (n: number): boolean =>
  Number.isInteger(n) && n >= 1 && n <= 65535;

const isValidUuid = (s: string): boolean => {
  const hex = s.replace(/-/g, "");
  return hex.length === 32 && /^[0-9a-fA-F]+$/.test(hex);
};

const orUndef = (v: string): string | undefined => (v === "" ? undefined : v);

/** Parse a saved proxy URL into config. Returns null on failure (form stays at default). */
const parseSavedUrl = (url: string): ProxyConfig | null => {
  try {
    return parseProxyUri(url);
  } catch {
    return null;
  }
};

/** Derive host:port label from parsed config for list display (no secrets). */
const hostPortLabel = (url: string): string => {
  const parsed = parseSavedUrl(url);
  if (parsed) return `${parsed.host}:${parsed.port}`;
  // Fallback: try URL constructor and strip credentials
  try {
    const u = new URL(url);
    u.username = "";
    u.password = "";
    return u.toString().replace(/\/\/@/, "//");
  } catch {
    return url;
  }
};

// ---- kind badge colours ----

const KIND_COLORS: Record<string, { bg: string; fg: string }> = {
  HTTP: { bg: "light-dark(#dbeafe, #1e3a5f)", fg: "light-dark(#1e40af, #93c5fd)" },
  HTTPS: { bg: "light-dark(#dbeafe, #1e3a5f)", fg: "light-dark(#1e40af, #93c5fd)" },
  SOCKS5: { bg: "light-dark(#d1fae5, #064e3b)", fg: "light-dark(#065f46, #6ee7b7)" },
  SS: { bg: "light-dark(#ede9fe, #3b1f6e)", fg: "light-dark(#6d28d9, #c4b5fd)" },
  "SS-2022": { bg: "light-dark(#ede9fe, #3b1f6e)", fg: "light-dark(#6d28d9, #c4b5fd)" },
  TROJAN: { bg: "light-dark(#ede9fe, #3b1f6e)", fg: "light-dark(#6d28d9, #c4b5fd)" },
  VLESS: { bg: "light-dark(#cffafe, #164e63)", fg: "light-dark(#0e7490, #67e8f9)" },
  "VLESS-WS": { bg: "light-dark(#cffafe, #164e63)", fg: "light-dark(#0e7490, #67e8f9)" },
  REALITY: { bg: "light-dark(#cffafe, #164e63)", fg: "light-dark(#0e7490, #67e8f9)" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardProvidersProxy() {
  const { t } = useTranslation();
  const { user } = useDashboardOutletContext();

  // ---- data ----
  const [proxies, setProxies] = useState<ProxyRecord[]>([]);
  const [backoffs, setBackoffs] = useState<Map<string, BackoffRow[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- form ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  // Config is always set — defaults to HTTP so the structured form is always visible.
  const [config, setConfig] = useState<ProxyConfig>(
    defaultsFor("http", { host: "", port: 0, name: "" }),
  );
  const [dialTimeoutInput, setDialTimeoutInput] = useState("");

  // ---- save ----
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ---- test ----
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    egress_ip?: string;
    error?: string;
  } | null>(null);

  // ---- delete ----
  const [deleteTarget, setDeleteTarget] = useState<ProxyRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ---- load data ----
  const refreshProxies = useCallback(async () => {
    const [proxiesRes, backoffsRes] = await Promise.all([
      callApi<ProxyRecord[]>(() => authFetch("/api/proxies")),
      callApi<BackoffRow[]>(() => authFetch("/api/proxies/backoffs")),
    ]);
    if (proxiesRes.data) setProxies(proxiesRes.data);
    if (backoffsRes.data) {
      const map = new Map<string, BackoffRow[]>();
      for (const row of backoffsRes.data) {
        const arr = map.get(row.proxy_id) ?? [];
        arr.push(row);
        map.set(row.proxy_id, arr);
      }
      setBackoffs(map);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [proxiesRes, backoffsRes] = await Promise.all([
        callApi<ProxyRecord[]>(() => authFetch("/api/proxies")),
        callApi<BackoffRow[]>(() => authFetch("/api/proxies/backoffs")),
      ]);
      if (cancelled) return;
      if (proxiesRes.error) {
        setLoadError(proxiesRes.error.message);
      } else if (proxiesRes.data) {
        setProxies(proxiesRes.data);
      }
      if (backoffsRes.data) {
        const map = new Map<string, BackoffRow[]>();
        for (const row of backoffsRes.data) {
          const arr = map.get(row.proxy_id) ?? [];
          arr.push(row);
          map.set(row.proxy_id, arr);
        }
        setBackoffs(map);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- form: protocol switch ----

  const handleKindChange = useCallback(
    (_: unknown, data: { optionValue?: string }) => {
      if (!data.optionValue) return;
      const next = data.optionValue as FormKind;
      setConfig((prev) =>
        defaultsFor(next, {
          host: prev.host,
          port: prev.port,
          name: prev.name,
        }),
      );
    },
    [],
  );

  // ---- form: per-kind field updaters ----

  const setHost = useCallback(
    (host: string) => setConfig((prev) => ({ ...prev, host } as ProxyConfig)),
    [],
  );

  const setPort = useCallback((raw: string) => {
    const trimmed = raw.trim();
    const n = trimmed === "" ? 0 : Number(trimmed);
    setConfig((prev) => ({ ...prev, port: Number.isFinite(n) ? n : 0 } as ProxyConfig));
  }, []);

  const clearForm = useCallback(() => {
    setEditingId(null);
    setFormName("");
    setConfig(defaultsFor("http", { host: "", port: 0, name: "" }));
    setDialTimeoutInput("");
    setSaveSuccess(false);
    setSaveError(null);
    setTestResult(null);
  }, []);

  const handleEdit = useCallback((proxy: ProxyRecord) => {
    setEditingId(proxy.id);
    setFormName(proxy.name);
    setDialTimeoutInput(
      proxy.dial_timeout_seconds != null
        ? String(proxy.dial_timeout_seconds)
        : "",
    );
    const parsed = parseSavedUrl(proxy.url);
    setConfig(parsed ?? defaultsFor("http", { host: "", port: 0, name: "" }));
    setSaveSuccess(false);
    setSaveError(null);
    setTestResult(null);
  }, []);

  // ---- save ----

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setSaveError("Name is required");
      setSaving(false);
      return;
    }

    // Build URL from structured config — secrets never shown in UI
    const builtUrl = formatProxyUri({ ...config, name: trimmedName });

    const timeoutParsed = (() => {
      const raw = dialTimeoutInput.trim();
      if (raw === "") return { value: null };
      if (!/^[1-9][0-9]*$/.test(raw)) return { error: "Must be a positive integer" as const };
      const n = Number(raw);
      if (n > 600) return { error: "Must be at most 600 seconds" as const };
      return { value: n };
    })();

    if ("error" in timeoutParsed) {
      setSaveError(`Dial timeout: ${timeoutParsed.error}`);
      setSaving(false);
      return;
    }

    const body: Record<string, unknown> = {
      name: trimmedName,
      url: builtUrl,
      dial_timeout_seconds: timeoutParsed.value,
    };

    const isEdit = editingId !== null;
    const result = await callApi<ProxyRecord>(() =>
      authFetch(
        isEdit
          ? `/api/proxies/${encodeURIComponent(editingId!)}`
          : "/api/proxies",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      ),
    );

    setSaving(false);
    if (result.error) {
      setSaveError(result.error.message);
      return;
    }

    setSaveSuccess(true);
    clearForm();
    await refreshProxies();
  }, [formName, config, dialTimeoutInput, editingId, clearForm, refreshProxies]);

  // ---- test ----

  const handleTest = useCallback(async () => {
    const builtUrl = formatProxyUri(config);

    setTesting(true);
    setTestResult(null);

    const timeoutParsed = (() => {
      const raw = dialTimeoutInput.trim();
      if (raw === "") return { value: null };
      const n = Number(raw);
      if (!isNaN(n) && n > 0 && n <= 600) return { value: n };
      return { value: null };
    })();

    const body: Record<string, unknown> = {
      url: builtUrl,
    };
    if (timeoutParsed.value != null) {
      body.dial_timeout_seconds = timeoutParsed.value;
    }

    try {
      const response = await authFetch("/api/proxies/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        ok: boolean;
        egress_ip?: string;
        error?: string;
      };
      setTestResult(data);
    } catch (e) {
      setTestResult({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTesting(false);
    }
  }, [config, dialTimeoutInput]);

  // ---- delete ----

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);

    const result = await callApi<{ ok: true }>(() =>
      authFetch(`/api/proxies/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      }),
    );

    setDeleting(false);
    if (result.error) {
      const raw = result.error.raw as ProxyConflictBody | undefined;
      if (
        raw?.referencing_upstream_ids &&
        raw.referencing_upstream_ids.length > 0
      ) {
        setDeleteError(
          `${t("dashboard.proxy.delete.conflict")} ${t("dashboard.proxy.delete.conflictWithIds", { ids: raw.referencing_upstream_ids.join(", ") })}`,
        );
      } else {
        setDeleteError(result.error.message);
      }
      setDeleteTarget(null);
      return;
    }

    setDeleteTarget(null);
    await refreshProxies();
  }, [deleteTarget, refreshProxies, t]);

  // ---- backoff reset ----

  const handleResetBackoff = useCallback(async (proxyId: string) => {
    await callApi<{ ok: true }>(() =>
      authFetch(`/api/proxies/${encodeURIComponent(proxyId)}/backoffs/reset`, {
        method: "POST",
      }),
    );
    const backoffsRes = await callApi<BackoffRow[]>(() =>
      authFetch("/api/proxies/backoffs"),
    );
    if (backoffsRes.data) {
      const map = new Map<string, BackoffRow[]>();
      for (const row of backoffsRes.data) {
        const arr = map.get(row.proxy_id) ?? [];
        arr.push(row);
        map.set(row.proxy_id, arr);
      }
      setBackoffs(map);
    }
  }, []);

  // ---- derived form state ----

  const formKind = formKindFromConfig(config);
  const hostInvalid = config.host.trim() === "";
  const portInvalid = !isValidPort(config.port);

  const uuidNeeded =
    config.kind === "vless-tcp" ||
    config.kind === "vless-ws" ||
    config.kind === "reality";
  const uuidInvalid = uuidNeeded ? !isValidUuid((config as { uuid: string }).uuid) : false;

  const canSave = formName.trim() !== "" && config.host.trim() !== "" && isValidPort(config.port);

  // ---- admin guard ----
  if (!user.isAdmin) {
    return (
      <section className="grid gap-[18px] min-w-0">
        <ProxyPageHeader />
        <Panel className="!p-[22px_24px]">
          <div className="grid gap-[10px] max-w-[680px]">
            <Text
              size={300}
              weight="semibold"
              style={{ color: "light-dark(#0f6cbd, #75b6f7)" }}
            >
              {t("dashboard.pages.adminOnly")}
            </Text>
            <Text size={300} className="text-fui-fg3">
              {t("dashboard.pages.adminOnlyDescription")}
            </Text>
          </div>
        </Panel>
      </section>
    );
  }

  // ---- loading ----
  if (loading) {
    return (
      <section className="grid gap-[18px] min-w-0">
        <ProxyPageHeader />
        <PageLoadingPanel label={t("common.loading")} />
      </section>
    );
  }

  // ---- main render ----
  return (
    <section className="grid gap-[18px] min-w-0">
      {/* Page header */}
      <ProxyPageHeader />

      {/* Load error */}
      {loadError && (
        <MessageBar intent="error">
          <MessageBarBody>{loadError}</MessageBarBody>
        </MessageBar>
      )}

      {/* Delete conflict error */}
      {deleteError && (
        <MessageBar intent="error">
          <MessageBarBody>{deleteError}</MessageBarBody>
        </MessageBar>
      )}

      {/* Two-panel layout: responsive side-by-side → stacked below 1170px.
           List panel grows freely, form panel capped at 420px. */}
      <div className="grid grid-cols-1 [@media(min-width:1170px)]:grid-cols-[1fr_auto] gap-[18px] items-start">
        {/* ============================================================ */}
        {/* Left: Proxy List                                              */}
        {/* ============================================================ */}
        <Panel className="!p-[22px_24px] grid gap-[14px] !max-w-none">
          <div className="flex items-center justify-between gap-[12px]">
            <div className="flex items-center gap-[8px]">
              <Text size={400} weight="semibold">
                {t("dashboard.proxy.listTitle")}
              </Text>
              {proxies.length > 0 && (
                <span className="text-[11px] font-semibold px-[6px] py-[1px] rounded-[3px] bg-fui-bg2 text-fui-fg3">
                  {proxies.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-[4px]">
              <Tooltip
                content={t("dashboard.proxy.addTitle")}
                relationship="label"
              >
                <Button
                  appearance="transparent"
                  icon={<AddRegular />}
                  onClick={clearForm}
                  size="small"
                />
              </Tooltip>
              <Tooltip
                content={t("dashboard.proxy.actions.refresh")}
                relationship="label"
              >
                <Button
                  appearance="transparent"
                  icon={<ArrowSyncRegular />}
                  onClick={refreshProxies}
                  size="small"
                />
              </Tooltip>
            </div>
          </div>

          {proxies.length === 0 ? (
            <Text size={300} className="text-fui-fg3 !m-0 py-[8px]">
              {t("dashboard.proxy.empty")}
            </Text>
          ) : (
            <Table className="-ml-[2px] !w-[calc(100%+2px)]">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>{t("dashboard.proxy.form.name")}</TableHeaderCell>
                  <TableHeaderCell>{t("dashboard.proxy.form.address")}</TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHeader>
              <TableBody>
                {proxies.map((proxy) => {
                  const kind = kindFromUri(proxy.url);
                  const colors = KIND_COLORS[kind] ?? {
                    bg: "light-dark(#f3f4f6, #374151)",
                    fg: "light-dark(#6b7280, #9ca3af)",
                  };

                  return (
                    <TableRow
                      aria-label={`${t("dashboard.proxy.actions.edit")}: ${proxy.name}`}
                      className="cursor-pointer hover:bg-fui-bg2"
                      key={proxy.id}
                      onClick={() => handleEdit(proxy)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleEdit(proxy);
                        }
                      }}
                      tabIndex={0}
                    >
                      <TableCell>
                        <TableCellLayout>
                          <div className="flex items-center gap-[8px] min-w-0">
                            <span
                              className="text-[10px] font-bold uppercase px-[6px] py-[2px] rounded-[3px] flex-none"
                              style={{
                                backgroundColor: colors.bg,
                                color: colors.fg,
                              }}
                            >
                              {t(`dashboard.proxy.kind.${kind}` as never, kind)}
                            </span>
                            <Text size={300} weight="semibold" className="truncate">
                              {proxy.name}
                            </Text>
                          </div>
                        </TableCellLayout>
                      </TableCell>
                      <TableCell>
                        <Text size={200} className="text-fui-fg3">
                          {hostPortLabel(proxy.url)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-[4px] justify-end">
                          <Button
                            appearance="transparent"
                            icon={<DeleteRegular />}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget(proxy);
                            }}
                            size="small"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Panel>

        {/* ============================================================ */}
        {/* Right: Add / Edit Form (structured — URL is never shown)    */}
        {/* ============================================================ */}
        <Panel className="!p-[22px_24px] grid gap-[16px] [@media(min-width:1170px)]:w-[420px]">
          <Text size={400} weight="semibold">
            {editingId
              ? t("dashboard.proxy.editTitle")
              : t("dashboard.proxy.addTitle")}
          </Text>

          {/* Name */}
          <Field label={t("dashboard.proxy.form.name")}>
            <Input
              onChange={(_, d) => setFormName(d.value)}
              placeholder={t("dashboard.proxy.form.namePlaceholder")}
              value={formName}
            />
          </Field>

          {/* Protocol selector */}
          <Field label={t("dashboard.proxy.form.protocol")}>
            <Dropdown
              onOptionSelect={handleKindChange}
              selectedOptions={[formKind]}
              value={FORM_KIND_LABELS[formKind]}
            >
              {KIND_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Dropdown>
          </Field>

          {/* Host + Port (common to all kinds) */}
          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-[1fr_8rem]">
            <Field
              label={t("dashboard.proxy.form.host")}
              validationState={hostInvalid ? "error" : undefined}
            >
              <Input
                onChange={(_, d) => setHost(d.value)}
                placeholder={t("dashboard.proxy.form.hostPlaceholder")}
                value={config.host}
              />
            </Field>
            <Field
              label={t("dashboard.proxy.form.port")}
              validationState={portInvalid ? "error" : undefined}
            >
              <Input
                className="!min-w-0"
                inputMode="numeric"
                onChange={(_, d) => setPort(d.value)}
                value={String(config.port)}
              />
            </Field>
          </div>

          {/* ---- HTTP / HTTPS ---- */}
          {config.kind === "http" && (
            <div className="grid grid-cols-1 gap-[12px]">
              <Field label={t("dashboard.proxy.form.username")}>
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      username: orUndef(d.value),
                    } as HttpProxyConfig))
                  }
                  value={(config as HttpProxyConfig).username ?? ""}
                />
              </Field>
              <Field label={t("dashboard.proxy.form.password")}>
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      password: orUndef(d.value),
                    } as HttpProxyConfig))
                  }
                  type="password"
                  value={(config as HttpProxyConfig).password ?? ""}
                />
              </Field>
            </div>
          )}

          {/* ---- SOCKS5 ---- */}
          {config.kind === "socks5" && (
            <div className="grid grid-cols-1 gap-[12px]">
              <Field label={t("dashboard.proxy.form.username")}>
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      username: orUndef(d.value),
                    } as Socks5ProxyConfig))
                  }
                  value={(config as Socks5ProxyConfig).username ?? ""}
                />
              </Field>
              <Field label={t("dashboard.proxy.form.password")}>
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      password: orUndef(d.value),
                    } as Socks5ProxyConfig))
                  }
                  type="password"
                  value={(config as Socks5ProxyConfig).password ?? ""}
                />
              </Field>
            </div>
          )}

          {/* ---- Shadowsocks ---- */}
          {config.kind === "ss" && (
            <div className="grid grid-cols-1 gap-[12px]">
              <Field label={t("dashboard.proxy.form.method")}>
                <Dropdown
                  onOptionSelect={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      method: d.optionValue,
                    } as ShadowsocksProxyConfig))
                  }
                  selectedOptions={[(config as ShadowsocksProxyConfig).method]}
                  value={(config as ShadowsocksProxyConfig).method}
                >
                  {SS_METHOD_OPTIONS.map((opt) => (
                    <Option key={opt.value} value={opt.value}>
                      {opt.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field
                label={t("dashboard.proxy.form.passwordLabel")}
                validationState={
                  (config as ShadowsocksProxyConfig).password === ""
                    ? "error"
                    : undefined
                }
              >
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      password: d.value,
                    } as ShadowsocksProxyConfig))
                  }
                  type="password"
                  value={(config as ShadowsocksProxyConfig).password}
                />
              </Field>
            </div>
          )}

          {/* ---- Shadowsocks 2022 ---- */}
          {config.kind === "ss2022" && (
            <div className="grid grid-cols-1 gap-[12px]">
              <Field label={t("dashboard.proxy.form.method")}>
                <Dropdown
                  onOptionSelect={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      method: d.optionValue,
                    } as Shadowsocks2022ProxyConfig))
                  }
                  selectedOptions={[
                    (config as Shadowsocks2022ProxyConfig).method,
                  ]}
                  value={(config as Shadowsocks2022ProxyConfig).method}
                >
                  {SS2022_METHOD_OPTIONS.map((opt) => (
                    <Option key={opt.value} value={opt.value}>
                      {opt.label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <Field
                label={t("dashboard.proxy.form.psk")}
                validationState={
                  (config as Shadowsocks2022ProxyConfig).passwordBase64 === ""
                    ? "error"
                    : undefined
                }
              >
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      passwordBase64: d.value,
                    } as Shadowsocks2022ProxyConfig))
                  }
                  type="password"
                  value={
                    (config as Shadowsocks2022ProxyConfig).passwordBase64
                  }
                />
              </Field>
            </div>
          )}

          {/* ---- Trojan ---- */}
          {config.kind === "trojan" && (
            <div className="grid grid-cols-1 gap-[12px]">
              <Field
                label={t("dashboard.proxy.form.passwordLabel")}
                validationState={
                  (config as TrojanProxyConfig).password === ""
                    ? "error"
                    : undefined
                }
              >
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      password: d.value,
                    } as TrojanProxyConfig))
                  }
                  type="password"
                  value={(config as TrojanProxyConfig).password}
                />
              </Field>
              <Field label={t("dashboard.proxy.form.sni")}>
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      sni: orUndef(d.value),
                    } as TrojanProxyConfig))
                  }
                  placeholder={t("dashboard.proxy.form.sniPlaceholder")}
                  value={(config as TrojanProxyConfig).sni ?? ""}
                />
              </Field>
              <Field label={t("dashboard.proxy.form.allowInsecure")}>
                <Switch
                  checked={
                    (config as TrojanProxyConfig).allowInsecure ?? false
                  }
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      allowInsecure: d.checked ? true : undefined,
                    } as TrojanProxyConfig))
                  }
                />
              </Field>
            </div>
          )}

          {/* ---- VLESS / TLS ---- */}
          {config.kind === "vless-tcp" && (
            <Field
              label={t("dashboard.proxy.form.uuid")}
              validationState={uuidInvalid ? "error" : undefined}
            >
              <Input
                onChange={(_, d) =>
                  setConfig((prev) => ({
                    ...prev,
                    uuid: d.value,
                  } as VlessTcpTlsProxyConfig))
                }
                placeholder={t("dashboard.proxy.form.uuidPlaceholder")}
                value={(config as VlessTcpTlsProxyConfig).uuid}
              />
            </Field>
          )}

          {/* ---- VLESS / WebSocket ---- */}
          {config.kind === "vless-ws" && (
            <div className="grid grid-cols-1 gap-[12px]">
              <Field
                label={t("dashboard.proxy.form.uuid")}
                validationState={uuidInvalid ? "error" : undefined}
              >
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      uuid: d.value,
                    } as VlessWsTlsProxyConfig))
                  }
                  placeholder={t("dashboard.proxy.form.uuidPlaceholder")}
                  value={(config as VlessWsTlsProxyConfig).uuid}
                />
              </Field>
              <Field
                label={t("dashboard.proxy.form.wsPath")}
                validationState={
                  (config as VlessWsTlsProxyConfig).path === ""
                    ? "error"
                    : undefined
                }
              >
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      path: d.value,
                    } as VlessWsTlsProxyConfig))
                  }
                  placeholder={t("dashboard.proxy.form.wsPathPlaceholder")}
                  value={(config as VlessWsTlsProxyConfig).path}
                />
              </Field>
              <Field label={t("dashboard.proxy.form.wsHost")}>
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      wsHost: orUndef(d.value),
                    } as VlessWsTlsProxyConfig))
                  }
                  placeholder={t("dashboard.proxy.form.wsHostPlaceholder")}
                  value={(config as VlessWsTlsProxyConfig).wsHost ?? ""}
                />
              </Field>
            </div>
          )}

          {/* ---- VLESS / REALITY ---- */}
          {config.kind === "reality" && (
            <div className="grid grid-cols-1 gap-[12px]">
              <Field
                label={t("dashboard.proxy.form.uuid")}
                validationState={uuidInvalid ? "error" : undefined}
              >
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      uuid: d.value,
                    } as RealityProxyConfig))
                  }
                  placeholder={t("dashboard.proxy.form.uuidPlaceholder")}
                  value={(config as RealityProxyConfig).uuid}
                />
              </Field>
              <Field
                label={t("dashboard.proxy.form.serverName")}
                validationState={
                  (config as RealityProxyConfig).serverName === ""
                    ? "error"
                    : undefined
                }
              >
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      serverName: d.value,
                    } as RealityProxyConfig))
                  }
                  placeholder={t("dashboard.proxy.form.serverNamePlaceholder")}
                  value={(config as RealityProxyConfig).serverName}
                />
              </Field>
              <Field
                label={t("dashboard.proxy.form.publicKey")}
                validationState={
                  (config as RealityProxyConfig).publicKey === ""
                    ? "error"
                    : undefined
                }
              >
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      publicKey: d.value,
                    } as RealityProxyConfig))
                  }
                  placeholder={t("dashboard.proxy.form.publicKeyPlaceholder")}
                  value={(config as RealityProxyConfig).publicKey}
                />
              </Field>
              <Field label={t("dashboard.proxy.form.shortId")}>
                <Input
                  onChange={(_, d) =>
                    setConfig((prev) => ({
                      ...prev,
                      shortId: orUndef(d.value),
                    } as RealityProxyConfig))
                  }
                  placeholder={t("dashboard.proxy.form.shortIdPlaceholder")}
                  value={(config as RealityProxyConfig).shortId ?? ""}
                />
              </Field>
            </div>
          )}

          {/* Dial timeout */}
          <Field label={t("dashboard.proxy.form.timeout")}>
            <Input
              inputMode="numeric"
              min={1}
              onChange={(_, d) => setDialTimeoutInput(d.value)}
              placeholder={`${DEFAULT_DIAL_TIMEOUT_SECONDS} (default)`}
              type="number"
              value={dialTimeoutInput}
            />
            <Text size={100} className="text-fui-fg3 mt-[4px]">
              {t("dashboard.proxy.form.timeoutHint")}
            </Text>
          </Field>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-[10px]">
            <Button
              appearance="primary"
              disabled={saving || !canSave}
              icon={saving ? <Spinner size="tiny" /> : undefined}
              onClick={handleSave}
            >
              {saving
                ? t("dashboard.proxy.actions.saving")
                : t("dashboard.proxy.actions.save")}
            </Button>
            <Button
              disabled={!config.host.trim() || !isValidPort(config.port) || testing}
              icon={testing ? <Spinner size="tiny" /> : undefined}
              onClick={handleTest}
            >
              {testing
                ? t("dashboard.proxy.actions.testing")
                : t("dashboard.proxy.actions.test")}
            </Button>
            {editingId && (
              <Button
                appearance="outline"
                className="ml-auto"
                onClick={clearForm}
              >
                {t("dashboard.proxy.cancelEdit")}
              </Button>
            )}
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className="rounded-lg border border-solid p-[12px_14px] grid gap-[4px]"
              style={{
                borderColor: testResult.ok
                  ? "light-dark(#0b6a0b, #6fcf6f)"
                  : "light-dark(#c50f1f, #e37b84)",
                backgroundColor: testResult.ok
                  ? "light-dark(#ddf6dd, #1b3a1b)"
                  : "light-dark(#fde7e9, #3d1517)",
              }}
            >
              <Text
                size={200}
                weight="semibold"
                style={{
                  color: testResult.ok
                    ? "light-dark(#0b6a0b, #6fcf6f)"
                    : "light-dark(#c50f1f, #e37b84)",
                }}
              >
                {testResult.ok
                  ? t("dashboard.proxy.test.ok")
                  : t("dashboard.proxy.test.failed", {
                      error: testResult.error ?? "",
                    })}
              </Text>
              {testResult.ok && testResult.egress_ip && (
                <Text size={200} className="text-fui-fg3">
                  {t("dashboard.proxy.test.egressIp", {
                    ip: testResult.egress_ip,
                  })}
                </Text>
              )}
            </div>
          )}

          {/* Save feedback */}
          {saveError && (
            <MessageBar intent="error">
              <MessageBarBody>{saveError}</MessageBarBody>
            </MessageBar>
          )}
          {saveSuccess && (
            <MessageBar intent="success">
              <MessageBarBody>
                {t("dashboard.proxy.actions.saveSuccess")}
              </MessageBarBody>
            </MessageBar>
          )}
        </Panel>
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog
          actionLabel={
            deleting
              ? t("dashboard.proxy.actions.deleting")
              : t("dashboard.proxy.actions.delete")
          }
          message={t("dashboard.proxy.delete.message", {
            name: deleteTarget.name,
          })}
          onConfirm={handleDeleteConfirm}
          onOpenChange={(open) => {
            if (!open && !deleting) setDeleteTarget(null);
          }}
          open
          title={t("dashboard.proxy.delete.title")}
        />
      )}
    </section>
  );
}
