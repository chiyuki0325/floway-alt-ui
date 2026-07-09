import { ServerRegular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type { UpstreamProviderKind } from "../api/types";
import azureIconUrl from "../assets/azure-color.svg";
import claudeIconUrl from "../assets/claude-color.svg";
import codexIconUrl from "../assets/codex.svg";
import githubCopilotIconUrl from "../assets/githubcopilot.svg";
import ollamaIconUrl from "../assets/ollama.svg";
import styles from "./provider-badge.module.css";

type ProviderBadgeKind = UpstreamProviderKind | null;
type ProviderTone = "amber" | "emerald" | "cyan" | "violet" | "rose" | "orange" | "zinc";

const providerMeta: Record<UpstreamProviderKind, { label: string; tone: ProviderTone }> = {
  custom: { label: "Custom", tone: "amber" },
  azure: { label: "Azure", tone: "emerald" },
  copilot: { label: "Copilot", tone: "cyan" },
  codex: { label: "Codex", tone: "violet" },
  "claude-code": { label: "Claude Code", tone: "orange" },
  ollama: { label: "Ollama", tone: "rose" },
};

export const providerLabel = (kind: ProviderBadgeKind) =>
  kind === null ? "Unknown" : providerMeta[kind].label;

export function ProviderBadge({ kind }: { kind: ProviderBadgeKind }) {
  const { t } = useTranslation();
  const meta = kind === null ? { label: "Unknown", tone: "zinc" as const } : providerMeta[kind];
  const label = t(`provider.${kind ?? "unknown"}`, meta.label);

  return (
    <span className={`${styles.badge} ${styles[meta.tone]}`} title={label}>
      <ProviderBadgeIcon kind={kind} />
      <span className={styles.label}>{label}</span>
    </span>
  );
}

function ProviderBadgeIcon({ kind }: { kind: ProviderBadgeKind }) {
  if (kind === "custom") return <ServerRegular className={styles.icon} />;
  if (kind === "azure") return <img alt="" src={azureIconUrl} />;
  if (kind === "copilot") return <img alt="" src={githubCopilotIconUrl} />;
  if (kind === "codex") return <img alt="" src={codexIconUrl} />;
  if (kind === "claude-code") return <img alt="" src={claudeIconUrl} />;
  if (kind === "ollama") return <img alt="" src={ollamaIconUrl} />;
  return null;
}
