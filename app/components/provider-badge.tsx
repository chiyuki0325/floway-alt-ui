import { ServerRegular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type { UpstreamProviderKind } from "../api/types";
import azureIconUrl from "../assets/azure-color.svg";
import claudeIconUrl from "../assets/claude-color.svg";
import codexIconUrl from "../assets/codex.svg";
import githubCopilotIconUrl from "../assets/githubcopilot.svg";
import ollamaIconUrl from "../assets/ollama.svg";

import { fluentComponents } from "../fluent";

const { makeStyles, Text } = fluentComponents;

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

const useStyles = makeStyles({
  amber: { backgroundColor: "#fff8f0", color: "#8a4b00" },
  emerald: { backgroundColor: "#f0faf5", color: "#0f6c4f" },
  cyan: { backgroundColor: "#eff9fb", color: "#006b75" },
  violet: { backgroundColor: "#f7f3ff", color: "#5b2e91" },
  rose: { backgroundColor: "#fff3f5", color: "#9f1d35" },
  orange: { backgroundColor: "#fff4ef", color: "#b14f2f" },
  zinc: { backgroundColor: "#f5f5f5", color: "#616161" },
});

export const providerLabel = (kind: ProviderBadgeKind) =>
  kind === null ? "Unknown" : providerMeta[kind].label;

export function ProviderBadge({ kind }: { kind: ProviderBadgeKind }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const meta = kind === null ? { label: "Unknown", tone: "zinc" as const } : providerMeta[kind];
  const label = t(`provider.${kind ?? "unknown"}`, meta.label);

  return (
    <span
      className={`${styles[meta.tone]} inline-flex items-center gap-[5px] rounded-full border border-current max-w-full min-h-[22px] py-0.5 px-2 whitespace-nowrap leading-[1.2]`}
      title={label}
    >
      <ProviderBadgeIcon kind={kind} />
      <Text size={200} weight="semibold" truncate wrap={false} className="min-w-0">
        {label}
      </Text>
    </span>
  );
}

function ProviderBadgeIcon({ kind }: { kind: ProviderBadgeKind }) {
  if (kind === "custom") return <ServerRegular className="block flex-none h-[14px] w-[14px]" />;
  if (kind === "azure") return <img alt="" src={azureIconUrl} className="block flex-none h-[14px] w-[14px]" />;
  if (kind === "copilot") return <img alt="" src={githubCopilotIconUrl} className="block flex-none h-[14px] w-[14px]" />;
  if (kind === "codex") return <img alt="" src={codexIconUrl} className="block flex-none h-[14px] w-[14px]" />;
  if (kind === "claude-code") return <img alt="" src={claudeIconUrl} className="block flex-none h-[14px] w-[14px]" />;
  if (kind === "ollama") return <img alt="" src={ollamaIconUrl} className="block flex-none h-[14px] w-[14px]" />;
  return null;
}
