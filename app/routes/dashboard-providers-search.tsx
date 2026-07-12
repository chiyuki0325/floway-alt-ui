import { useCallback, useEffect, useState } from "react";
import { redirect } from "react-router";
import { useTranslation } from "react-i18next";

import type { Route } from "./+types/dashboard-providers-search";
import type { SearchConfig, SearchConfigTestResult } from "../api/types";
import { authFetch, callApi } from "../api/auth";
import { getSessionToken } from "../auth/session";
import bingIconUrl from "../assets/bing.svg";
import jinaIconUrl from "../assets/jina.svg";
import tavilyIconUrl from "../assets/tavily.svg";
import { Dropdown, Input } from "../components/fluent-form-controls";
import { PageLoadingPanel } from "../components/page-loading-panel";
import { Panel } from "../components/panel";
import { fluentComponents } from "../fluent";
import { useDashboardOutletContext } from "./dashboard";

const {
  Button,
  Field,
  Link,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Text,
} = fluentComponents;

export async function clientLoader() {
  if (!getSessionToken()) throw redirect("/");
  return null;
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Provider Search | Floway" }];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: SearchConfig = {
  provider: "disabled",
  tavily: { apiKey: "" },
  microsoftGrounding: { apiKey: "" },
  jina: { apiKey: "" },
};

interface ProviderOption {
  value: SearchConfig["provider"];
  labelKey: string;
  iconUrl?: string;
  descKey?: string;
  url?: string;
  getApiKey: (config: SearchConfig) => string;
  setApiKey: (config: SearchConfig, key: string) => SearchConfig;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: "disabled",
    labelKey: "dashboard.searchConfig.provider.disabled",
    getApiKey: () => "",
    setApiKey: (c) => c,
  },
  {
    value: "tavily",
    labelKey: "dashboard.searchConfig.provider.tavily",
    iconUrl: tavilyIconUrl,
    descKey: "dashboard.searchConfig.providerDescTavily",
    url: "https://app.tavily.com/",
    getApiKey: (c) => c.tavily.apiKey,
    setApiKey: (c, k) => ({ ...c, tavily: { apiKey: k } }),
  },
  {
    value: "microsoft-grounding",
    labelKey: "dashboard.searchConfig.provider.microsoftGrounding",
    iconUrl: bingIconUrl,
    descKey: "dashboard.searchConfig.providerDescMicrosoftGrounding",
    url: "https://www.microsoft.com/en-us/bing/apis",
    getApiKey: (c) => c.microsoftGrounding.apiKey,
    setApiKey: (c, k) => ({ ...c, microsoftGrounding: { apiKey: k } }),
  },
  {
    value: "jina",
    labelKey: "dashboard.searchConfig.provider.jina",
    iconUrl: jinaIconUrl,
    descKey: "dashboard.searchConfig.providerDescJina",
    url: "https://jina.ai/",
    getApiKey: (c) => c.jina.apiKey,
    setApiKey: (c, k) => ({ ...c, jina: { apiKey: k } }),
  },
];

function findProviderOption(
  provider: SearchConfig["provider"],
): ProviderOption {
  return (
    PROVIDER_OPTIONS.find((o) => o.value === provider) ?? PROVIDER_OPTIONS[0]
  );
}

function SearchPageHeader() {
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
        {t("dashboard.searchConfig.heading")}
      </Text>
      <Text size={300} className="text-fui-fg2 leading-[1.45] max-w-[760px]">
        {t("dashboard.searchConfig.description")}
      </Text>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardProvidersSearch() {
  const { t } = useTranslation();
  const { user } = useDashboardOutletContext();

  // Draft state
  const [draft, setDraft] = useState<SearchConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<SearchConfigTestResult | null>(
    null,
  );

  const activeOption = findProviderOption(draft.provider);

  // Load config on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await callApi<SearchConfig>(() =>
        authFetch("/api/search-config"),
      );
      if (cancelled) return;
      if (result.error) {
        setLoadError(result.error.message);
      } else if (result.data) {
        setDraft(result.data);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handlers
  const handleProviderChange = useCallback(
    (_: unknown, data: { optionValue?: string }) => {
      if (data.optionValue) {
        setDraft((prev) => ({
          ...prev,
          provider: data.optionValue as SearchConfig["provider"],
        }));
        setSaveSuccess(false);
        setTestResult(null);
      }
    },
    [],
  );

  const handleApiKeyChange = useCallback(
    (_: unknown, data: { value: string }) => {
      setDraft((prev) => activeOption.setApiKey(prev, data.value));
      setSaveSuccess(false);
    },
    [activeOption],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    const result = await callApi<SearchConfig>(() =>
      authFetch("/api/search-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      }),
    );
    setSaving(false);
    if (result.error) {
      setSaveError(result.error.message);
    } else {
      setSaveSuccess(true);
    }
  }, [draft]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await authFetch("/api/search-config/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body: SearchConfigTestResult = await response.json();
      setTestResult(body);
    } catch (e) {
      setTestResult({
        ok: false,
        provider: draft.provider,
        query: "",
        error: {
          code: "NETWORK",
          message: e instanceof Error ? e.message : String(e),
        },
      });
    } finally {
      setTesting(false);
    }
  }, [draft]);

  // ---- admin guard ----
  if (!user.isAdmin) {
    return (
      <section className="grid gap-[18px] max-w-[960px] min-w-0">
        <SearchPageHeader />
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
      <section className="grid gap-[18px] max-w-[960px] min-w-0">
        <SearchPageHeader />
        <PageLoadingPanel label={t("common.loading")} />
      </section>
    );
  }

  // ---- main render ----
  return (
    <section className="grid gap-[18px] max-w-[960px] min-w-0">
      {/* Page header */}
      <SearchPageHeader />

      {/* Config panel */}
      <Panel className="!p-[22px_24px] grid gap-[16px]">
        {loadError && (
          <MessageBar intent="error">
            <MessageBarBody>{loadError}</MessageBarBody>
          </MessageBar>
        )}

        {/* Provider selector */}
        <Field label={t("dashboard.searchConfig.providerLabel")}>
          <Dropdown
            button={{
              children: (
                <ProviderOptionLabel
                  iconUrl={activeOption.iconUrl}
                  label={t(activeOption.labelKey)}
                />
              ),
            }}
            onOptionSelect={handleProviderChange}
            selectedOptions={[draft.provider]}
            value={t(activeOption.labelKey)}
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value} text={t(opt.labelKey)}>
                <ProviderOptionLabel iconUrl={opt.iconUrl} label={t(opt.labelKey)} />
              </Option>
            ))}
          </Dropdown>
        </Field>

        {/* Provider description + get key link */}
        {activeOption.descKey && (
          <div className="grid gap-[4px]">
            <Text size={200} className="text-fui-fg3">
              {t(activeOption.descKey)}
            </Text>
            {activeOption.url && (
              <Link href={activeOption.url} target="_blank" rel="noopener noreferrer">
                {t("dashboard.searchConfig.getKeyLink")}
              </Link>
            )}
          </div>
        )}

        {/* API Key input */}
        {draft.provider === "disabled" ? (
          <Field label={t("dashboard.searchConfig.apiKeyLabel")}>
            <Input
              disabled
              value={t("dashboard.searchConfig.noCredentialNeeded")}
            />
          </Field>
        ) : (
          <Field label={t("dashboard.searchConfig.apiKeyLabel")}>
            <Input
              onChange={handleApiKeyChange}
              placeholder={t("dashboard.searchConfig.apiKeyPlaceholder")}
              type="password"
              value={activeOption.getApiKey(draft)}
            />
          </Field>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-[10px] sm:flex-row sm:items-center">
          <Button
            appearance="primary"
            disabled={saving}
            icon={saving ? <Spinner size="tiny" /> : undefined}
            onClick={handleSave}
          >
            {saving
              ? t("dashboard.searchConfig.saving")
              : t("dashboard.searchConfig.save")}
          </Button>
          <Button
            disabled={draft.provider === "disabled" || testing}
            icon={testing ? <Spinner size="tiny" /> : undefined}
            onClick={handleTest}
          >
            {testing
              ? t("dashboard.searchConfig.testing")
              : t("dashboard.searchConfig.test")}
          </Button>
        </div>

        {draft.provider === "disabled" && (
          <Text size={200} className="text-fui-fg3">
            {t("dashboard.searchConfig.testDisabledHint")}
          </Text>
        )}

        {/* Messages */}
        {saveError && (
          <MessageBar intent="error">
            <MessageBarBody>{saveError}</MessageBarBody>
          </MessageBar>
        )}
        {saveSuccess && (
          <MessageBar intent="success">
            <MessageBarBody>
              {t("dashboard.searchConfig.saveSuccess")}
            </MessageBarBody>
          </MessageBar>
        )}
      </Panel>

      {/* Test results */}
      {testResult && (
        <Panel className="!p-[22px_24px] grid gap-[14px]">
          <Text size={400} weight="semibold">
            {t("dashboard.searchConfig.testResults")}
          </Text>

          {/* Status badge + meta */}
          <div className="flex items-center gap-[8px] flex-wrap">
            {testResult.ok ? (
              <span
                className="text-[10px] font-bold uppercase px-[6px] py-[2px] rounded-[3px]"
                style={{
                  backgroundColor: "light-dark(#ddf6dd, #1b3a1b)",
                  color: "light-dark(#0b6a0b, #6fcf6f)",
                }}
              >
                OK
              </span>
            ) : (
              <span
                className="text-[10px] font-bold uppercase px-[6px] py-[2px] rounded-[3px]"
                style={{
                  backgroundColor: "light-dark(#fde7e9, #3d1517)",
                  color: "light-dark(#c50f1f, #e37b84)",
                }}
              >
                Error
              </span>
            )}
            <Text size={200} className="text-fui-fg3">
              Provider: {testResult.provider}
              {testResult.query ? ` · Query: ${testResult.query}` : ""}
            </Text>
          </div>

          {/* Results */}
          {testResult.ok && testResult.results ? (
            testResult.results.length === 0 ? (
              <Text size={200} className="text-fui-fg3">
                {t("dashboard.searchConfig.testSuccess", { count: 0 })}
              </Text>
            ) : (
              <div className="grid gap-[10px]">
                {testResult.results.map((r) => (
                  <div
                    key={r.url + r.title}
                    className="rounded-lg border border-solid border-fui-stroke1 !p-[12px_14px] grid gap-[4px]"
                  >
                    <div className="flex items-baseline gap-[8px] flex-wrap">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-fui-brand1 no-underline hover:underline font-semibold text-[14px]"
                      >
                        {r.title}
                      </a>
                      {r.pageAge && (
                        <Text size={100} className="text-fui-fg3">
                          {t("dashboard.searchConfig.pageAge", {
                            age: r.pageAge,
                          })}
                        </Text>
                      )}
                    </div>
                    <Text
                      size={100}
                      className="text-fui-fg3"
                      style={{ wordBreak: "break-all" }}
                    >
                      {r.url}
                    </Text>
                    <Text size={200} className="text-fui-fg2">
                      {r.previewText}
                    </Text>
                  </div>
                ))}
              </div>
            )
          ) : testResult.error ? (
            <div
              className="rounded-lg border border-solid p-[12px_14px] grid gap-[4px]"
              style={{
                borderColor: "light-dark(#c50f1f, #e37b84)",
                backgroundColor: "light-dark(#fde7e9, #3d1517)",
              }}
            >
              <Text
                size={200}
                weight="semibold"
                style={{ color: "light-dark(#c50f1f, #e37b84)" }}
              >
                {testResult.error.code}
              </Text>
              <Text size={200} className="text-fui-fg1">
                {testResult.error.message}
              </Text>
            </div>
          ) : null}
        </Panel>
      )}
    </section>
  );
}

function ProviderOptionLabel({ iconUrl, label }: { iconUrl?: string; label: string }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      {iconUrl && (
        <img
          alt=""
          aria-hidden="true"
          className="block flex-none h-[16px] w-[16px]"
          src={iconUrl}
          style={{ filter: "light-dark(none, invert(1))" }}
        />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}
