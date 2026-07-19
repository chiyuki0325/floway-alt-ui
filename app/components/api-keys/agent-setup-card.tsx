import claudeIconUrl from "../../assets/claude-color.svg";
import codexIconUrl from "../../assets/codex.svg";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ApiKey, ControlPlaneModel } from "../../api/types";
import { fluentComponents } from "../../fluent";
import { CodeBlock } from "../code-block";
import { Combobox, Select } from "../fluent-form-controls";
import { codexUnixCredentialSnippet, codexWindowsCredentialSnippet } from "./cli-configuration";
import { agentSetupCommand, useAgentSetup, type AgentSetupConfiguration } from "./use-agent-setup";

const { Button, Field, MessageBar, MessageBarBody, Option, Spinner, Switch, Tab, TabList, Text } = fluentComponents;
type Agent = "claude" | "codex";
type Platform = "unix" | "windows";
const NONE = "__floway_none__";

export function AgentSetupCard({ copiedTag, models, onCopy, selectedKey }: {
  copiedTag: string | null;
  models: ControlPlaneModel[];
  onCopy: (text: string, tag: string) => void;
  selectedKey: ApiKey | null;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<"setup" | "snippets">("setup");
  const [agent, setAgent] = useState<Agent>("claude");
  const [platform, setPlatform] = useState<Platform>(() => typeof navigator !== "undefined" && /Win/i.test(navigator.platform) ? "windows" : "unix");
  const setup = useAgentSetup(selectedKey?.id ?? null);

  const scripts = setup.lease?.scripts[agent];
  const scriptPath = platform === "unix" ? scripts?.sh : scripts?.ps1;
  const command = scriptPath
    ? agentSetupCommand(typeof window === "undefined" ? "http://localhost:5173" : window.location.origin, scriptPath, platform)
    : t("dashboard.apiKeys.agentSetup.commandPending");

  return <div className="grid gap-4 min-w-0">
    <ViewTabs value={view} onChange={setView} />
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <TabList selectedValue={agent} onTabSelect={(_, data) => setAgent(data.value === "codex" ? "codex" : "claude")}>
        <AgentTab icon={claudeIconUrl} label={t("dashboard.apiKeys.configuration.claudeCode")} value="claude" />
        <AgentTab icon={codexIconUrl} label={t("dashboard.apiKeys.configuration.codex")} value="codex" />
      </TabList>
      {setup.syncing && <span className="inline-flex items-center gap-2 text-fui-fg2 text-fui-base200"><Spinner size="tiny" />{t("dashboard.apiKeys.agentSetup.saving")}</span>}
    </div>

    {!selectedKey && <MessageBar><MessageBarBody>{t("dashboard.apiKeys.agentSetup.selectKey")}</MessageBarBody></MessageBar>}
    {selectedKey && !setup.lease && !setup.error && !setup.noSelectableKey && <span className="inline-flex items-center gap-2 text-fui-fg2"><Spinner size="tiny" />{t("dashboard.apiKeys.agentSetup.preparing")}</span>}
    {setup.noSelectableKey && <MessageBar><MessageBarBody>{t("dashboard.apiKeys.agentSetup.noKey")}</MessageBarBody></MessageBar>}
    {setup.terminated && <MessageBar intent="warning"><MessageBarBody>{t("dashboard.apiKeys.agentSetup.expired")}</MessageBarBody></MessageBar>}
    {setup.error && <MessageBar intent="error"><MessageBarBody><span className="inline-flex items-center gap-2 flex-wrap">{setup.error}<Button appearance="secondary" onClick={setup.retryCreate} size="small">{t("dashboard.apiKeys.agentSetup.retry")}</Button></span></MessageBarBody></MessageBar>}

    {setup.draft && <AgentConfigurationFields agent={agent} configuration={setup.draft} models={models} onChange={setup.updateDraft} />}

    {view === "snippets" && selectedKey && setup.draft
      ? <AgentConfigSnippets agent={agent} apiKey={selectedKey.key} configuration={setup.draft} copiedTag={copiedTag} onCopy={onCopy} />
      : view === "snippets"
        ? <MessageBar><MessageBarBody>{t("dashboard.apiKeys.agentSetup.selectKey")}</MessageBarBody></MessageBar>
        : <div className="grid gap-3 border-t border-t-solid border-fui-stroke1 pt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <TabList selectedValue={platform} onTabSelect={(_, data) => setPlatform(data.value === "windows" ? "windows" : "unix")}>
          <Tab value="unix">macOS / Linux</Tab><Tab value="windows">Windows</Tab>
        </TabList>
        <Text size={200} className="text-fui-fg2">{t("dashboard.apiKeys.agentSetup.expires")}</Text>
      </div>
      <CodeBlock
        code={command}
        copied={copiedTag === `agent-setup-${agent}-${platform}`}
        disabled={!setup.canCopy}
        language={platform === "unix" ? "bash" : "powershell"}
        onCopy={() => setup.canCopy && onCopy(command, `agent-setup-${agent}-${platform}`)}
      />
    </div>}
  </div>;
}

function AgentConfigSnippets({ agent, apiKey, configuration, copiedTag, onCopy }: {
  agent: Agent;
  apiKey: string;
  configuration: AgentSetupConfiguration;
  copiedTag: string | null;
  onCopy: (text: string, tag: string) => void;
}) {
  const { t } = useTranslation();
  const origin = typeof window === "undefined" ? "http://localhost:5173" : window.location.origin;
  if (agent === "claude") {
    const settings = configuration.claudeCode;
    const snippet = JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: origin,
        ANTHROPIC_AUTH_TOKEN: apiKey,
        ...(settings.model ? { ANTHROPIC_MODEL: settings.model } : {}),
        ...(settings.defaultOpusModel ? { ANTHROPIC_DEFAULT_OPUS_MODEL: settings.defaultOpusModel } : {}),
        ...(settings.defaultSonnetModel ? { ANTHROPIC_DEFAULT_SONNET_MODEL: settings.defaultSonnetModel } : {}),
        ...(settings.defaultHaikuModel ? { ANTHROPIC_DEFAULT_HAIKU_MODEL: settings.defaultHaikuModel } : {}),
        ...(settings.modelDiscovery ? { CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1" } : {}),
      },
      ...(settings.effortLevel ? { effortLevel: settings.effortLevel } : {}),
    }, null, 2);
    return <div className="grid gap-2 border-t border-t-solid border-fui-stroke1 pt-4">
      <Text size={200} className="text-fui-fg2">{t("dashboard.apiKeys.configuration.claudeHint")}</Text>
      <CodeBlock code={snippet} copied={copiedTag === "agent-snippet-claude"} language="json" onCopy={() => onCopy(snippet, "agent-snippet-claude")} />
    </div>;
  }
  const config = buildAgentCodexSnippet(origin, configuration.codex);
  const unix = codexUnixCredentialSnippet(apiKey);
  const windows = codexWindowsCredentialSnippet(apiKey);
  return <div className="grid gap-3 border-t border-t-solid border-fui-stroke1 pt-4">
    <Text size={200} className="text-fui-fg2">{t("dashboard.apiKeys.configuration.codexConfigHint")}</Text>
    <CodeBlock code={config} copied={copiedTag === "agent-snippet-codex"} language="toml" onCopy={() => onCopy(config, "agent-snippet-codex")} />
    <CodeBlock code={unix} copied={copiedTag === "agent-snippet-codex-unix"} language="bash" onCopy={() => onCopy(unix, "agent-snippet-codex-unix")} />
    <CodeBlock code={windows} copied={copiedTag === "agent-snippet-codex-windows"} language="powershell" onCopy={() => onCopy(windows, "agent-snippet-codex-windows")} />
  </div>;
}

export const buildAgentCodexSnippet = (origin: string, config: AgentSetupConfiguration["codex"]) => [
  ...(config.model ? [`model = ${JSON.stringify(config.model)}`] : []),
  ...(config.reasoningEffort ? [`model_reasoning_effort = ${JSON.stringify(config.reasoningEffort)}`] : []),
  'model_provider = "floway"',
  "suppress_unstable_features_warning = true",
  "",
  "[model_providers.floway]",
  'name = "Floway"',
  `base_url = ${JSON.stringify(`${origin}/azure-api.codex`)}`,
  'auth = { command = "sh", args = ["-c", "cat \\"${CODEX_HOME:-$HOME/.codex}/floway-token\\""] }',
  'wire_api = "responses"',
  "supports_websockets = true",
  'http_headers = { "x-openai-actor-authorization" = "1" }',
  "",
  "[features]",
  "apps = false",
  "standalone_web_search = true",
].join("\n");

function ViewTabs({ onChange, value }: { onChange: (value: "setup" | "snippets") => void; value: "setup" | "snippets" }) {
  const { t } = useTranslation();
  return <TabList selectedValue={value} onTabSelect={(_, data) => onChange(data.value === "snippets" ? "snippets" : "setup")}>
    <Tab value="setup">{t("dashboard.apiKeys.agentSetup.setupTab")}</Tab>
    <Tab value="snippets">{t("dashboard.apiKeys.agentSetup.snippetsTab")}</Tab>
  </TabList>;
}

function AgentTab({ icon, label, value }: { icon: string; label: string; value: Agent }) {
  return <Tab value={value}><span className="inline-flex items-center gap-2"><img alt="" className="h-4 w-4" src={icon} />{label}</span></Tab>;
}

function AgentConfigurationFields({ agent, configuration, models, onChange }: {
  agent: Agent;
  configuration: AgentSetupConfiguration;
  models: ControlPlaneModel[];
  onChange: (update: (current: AgentSetupConfiguration) => AgentSetupConfiguration) => void;
}) {
  const { t } = useTranslation();
  const patchClaude = (patch: Partial<AgentSetupConfiguration["claudeCode"]>) => onChange((current) => ({ ...current, claudeCode: { ...current.claudeCode, ...patch } }));
  const patchCodex = (patch: Partial<AgentSetupConfiguration["codex"]>) => onChange((current) => ({ ...current, codex: { ...current.codex, ...patch } }));
  const codexModel = models.find((model) => model.id === configuration.codex.model);
  const effortOptions = codexModel?.chat?.reasoning?.effort?.supported ?? [];

  if (agent === "claude") return <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-2 max-[620px]:grid-cols-1">
    <ModelSelect label={t("dashboard.apiKeys.agentSetup.defaultModel")} models={models} family="claude" picker="default" value={configuration.claudeCode.model} onChange={(model) => patchClaude({ model })} />
    <ModelSelect label={t("dashboard.apiKeys.agentSetup.opusModel")} models={models} family="claude" picker="opus" value={configuration.claudeCode.defaultOpusModel} onChange={(model) => patchClaude({ defaultOpusModel: model })} />
    <ModelSelect label={t("dashboard.apiKeys.agentSetup.sonnetModel")} models={models} family="claude" picker="sonnet" value={configuration.claudeCode.defaultSonnetModel} onChange={(model) => patchClaude({ defaultSonnetModel: model })} />
    <ModelSelect label={t("dashboard.apiKeys.agentSetup.haikuModel")} models={models} family="claude" picker="haiku" value={configuration.claudeCode.defaultHaikuModel} onChange={(model) => patchClaude({ defaultHaikuModel: model })} />
    <Field label={t("dashboard.apiKeys.agentSetup.reasoningEffort")}>
      <Select value={configuration.claudeCode.effortLevel ?? NONE} onChange={(_, data) => patchClaude({ effortLevel: data.value === NONE ? null : data.value as NonNullable<AgentSetupConfiguration["claudeCode"]["effortLevel"]> })}>
        <option value={NONE}>{t("dashboard.apiKeys.agentSetup.modelDefault")}</option>
        {(["low", "medium", "high", "xhigh"] as const).map((effort) => <option key={effort} value={effort}>{effort}</option>)}
      </Select>
    </Field>
    <Switch checked={configuration.claudeCode.modelDiscovery} label={t("dashboard.apiKeys.agentSetup.modelDiscovery")} onChange={(_, data) => patchClaude({ modelDiscovery: data.checked })} />
  </div>;

  return <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
    <ModelSelect label={t("dashboard.apiKeys.agentSetup.defaultModel")} models={models} family="codex" picker="default" value={configuration.codex.model} onChange={(model) => patchCodex({ model })} />
    <Field label={t("dashboard.apiKeys.agentSetup.reasoningEffort")}>
      <Combobox freeform value={configuration.codex.reasoningEffort ?? ""} onChange={(event) => patchCodex({ reasoningEffort: event.target.value || null })} onOptionSelect={(_, data) => patchCodex({ reasoningEffort: data.optionText || null })}>
        {effortOptions.map((effort) => <Option key={effort}>{effort}</Option>)}
      </Combobox>
    </Field>
  </div>;
}

function ModelSelect({ family, label, models, onChange, picker, value }: {
  family: "claude" | "codex";
  label: string;
  models: ControlPlaneModel[];
  onChange: (value: string | null) => void;
  picker: "default" | "opus" | "sonnet" | "haiku";
  value: string | null;
}) {
  const { t } = useTranslation();
  const options = useMemo(() => modelOptions(models, family, picker, value), [family, models, picker, value]);
  return <Field label={label}><Select value={value ?? NONE} onChange={(_, data) => onChange(data.value === NONE ? null : data.value)}>
    <option value={NONE}>{t("dashboard.apiKeys.agentSetup.modelDefault")}</option>
    {options.map((option) => <option key={option.value} value={option.value}>{option.unavailable ? t("dashboard.apiKeys.agentSetup.unavailable", { id: option.label }) : option.label}</option>)}
  </Select></Field>;
}

export const modelOptions = (models: ControlPlaneModel[], family: "claude" | "codex", picker: "default" | "opus" | "sonnet" | "haiku", current: string | null) => {
  const target = { default: 0, opus: 1, sonnet: 2, haiku: 3 }[picker];
  const rows = [...new Map(models.filter((model) => model.kind === "chat").map((model) => [model.id, model])).values()];
  rows.sort((a, b) => rankModel(a.id, family, target) - rankModel(b.id, family, target));
  const options = rows.map((model) => {
    const context = model.limits.max_context_window_tokens ?? (model.limits.max_prompt_tokens ?? 0) + (model.limits.max_output_tokens ?? 0);
    const value = family === "claude" && picker !== "haiku" && context >= 1_000_000 ? `${model.id}[1m]` : model.id;
    return { value, label: model.id, unavailable: false };
  });
  if (current && !options.some((option) => option.value === current)) options.push({ value: current, label: current, unavailable: true });
  return options;
};

const rankModel = (id: string, family: "claude" | "codex", target: number) => {
  const lower = id.toLowerCase();
  if (family === "codex") return /(^|\/)gpt-5/.test(lower) ? 0 : 100;
  if (!/(^|\/)claude-/.test(lower)) return 100;
  const tier = lower.includes("fable") ? 0 : lower.includes("opus") ? 1 : lower.includes("sonnet") ? 2 : lower.includes("haiku") ? 3 : 4;
  return Math.abs(tier - target);
};
