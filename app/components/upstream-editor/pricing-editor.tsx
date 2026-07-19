import { AddRegular, ArrowDownRegular, ArrowUpRegular, DeleteRegular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  BILLING_DIMENSIONS,
  collectModelPricingIssues,
  type BillingDimension,
  type ModelKind,
  type ModelPricing,
  type PriceVector,
  type PricingEntry,
  type PricingSelector,
  type PricingThresholdOperator,
} from "@floway-dev/protocols/common";
import { fluentComponents } from "../../fluent";
import { Input, Select } from "../fluent-form-controls";

const { Button, Field, Text, Tooltip, makeStyles } = fluentComponents;
const useStyles = makeStyles({ error: { color: "var(--colorPaletteRedForeground1)" } });

const DIMENSIONS_BY_KIND: Record<ModelKind, BillingDimension[]> = {
  chat: ["input", "input_cache_read", "input_cache_write", "input_cache_write_1h", "output"],
  embedding: ["input"],
  image: ["input", "input_image", "output", "output_image"],
};

const dimensionKey = (dimension: BillingDimension) =>
  `dashboard.upstreamEditor.models.pricingDimensions.${dimension}` as const;

const mutableEntry = (entry: PricingEntry): PricingEntry => ({
  ...(entry.selector ? { selector: structuredClone(entry.selector) } : {}),
  rates: { ...entry.rates },
});

export function pricingEntries(value: ModelPricing | undefined): PricingEntry[] {
  return (value?.entries ?? []).map(mutableEntry);
}

export function writePricingEntry(
  value: ModelPricing | undefined,
  index: number,
  update: (entry: PricingEntry) => PricingEntry,
): ModelPricing | undefined {
  const entries = pricingEntries(value);
  if (!entries[index]) return value;
  entries[index] = update(entries[index]);
  return { entries };
}

export function pricingIsValid(value: ModelPricing | undefined): boolean {
  return value === undefined || collectModelPricingIssues(value).length === 0;
}

export function PricingEditor({ editable, kind, onChange, value }: {
  editable: boolean;
  kind: ModelKind;
  onChange: (value: ModelPricing | undefined) => void;
  value: ModelPricing | undefined;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const entries = pricingEntries(value);
  const [selected, setSelected] = useState(0);
  const [operatorDrafts, setOperatorDrafts] = useState<Record<number, PricingThresholdOperator>>({});

  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, entries.length - 1)));
    setOperatorDrafts({});
  }, [value]);

  const visibleDimensions = useMemo(() => BILLING_DIMENSIONS.filter((dimension) =>
    DIMENSIONS_BY_KIND[kind].includes(dimension)
      || entries.some((entry) => entry.rates[dimension] !== undefined)), [entries, kind]);
  const issues = value === undefined ? [] : collectModelPricingIssues(value);
  const active = entries[selected];

  const replaceEntries = (next: PricingEntry[]) => onChange(next.length ? { entries: next } : undefined);
  const updateActive = (update: (entry: PricingEntry) => PricingEntry) => {
    const next = writePricingEntry(value, selected, update);
    onChange(next);
  };
  const selectorFor = (entry: PricingEntry): Record<string, unknown> => ({ ...(entry.selector ?? {}) });
  const serviceTier = typeof active?.selector?.serviceTier === "string" ? active.selector.serviceTier : "";
  const inputTokens = active?.selector?.inputTokens;
  const threshold = inputTokens && typeof inputTokens === "object" ? inputTokens : undefined;
  const operator = threshold?.operator ?? operatorDrafts[selected] ?? "gt";

  const coordinateLabel = (entry: PricingEntry) => {
    const labels: string[] = [];
    if (typeof entry.selector?.serviceTier === "string" && entry.selector.serviceTier.trim()) labels.push(entry.selector.serviceTier);
    const tokens = entry.selector?.inputTokens;
    if (tokens && typeof tokens === "object") labels.push(`${tokens.operator === "gte" ? ">=" : ">"} ${tokens.value}`);
    return labels.length ? labels.join(", ") : t("dashboard.upstreamEditor.models.pricingBase");
  };

  return <div className="grid gap-4">
    <div className="grid grid-cols-[minmax(150px,220px)_minmax(0,1fr)] border-t border-t-solid border-fui-stroke1 max-[760px]:grid-cols-1">
      <div className="grid content-start border-r border-r-solid border-fui-stroke1 py-3 pr-3 max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:border-b-solid max-[760px]:pr-0">
        {entries.map((entry, index) => <div className="flex items-center gap-1 min-w-0" key={index}>
          <Button
            appearance={selected === index ? "secondary" : "subtle"}
            className="!justify-start flex-1 min-w-0"
            onClick={() => setSelected(index)}
            size="small"
          >
            <span className="truncate">{coordinateLabel(entry)}</span>
          </Button>
          {editable && <div className="inline-flex flex-none">
            <Tooltip content={t("dashboard.upstreamEditor.actions.moveUp")} relationship="label"><Button appearance="subtle" aria-label={t("dashboard.upstreamEditor.actions.moveUp")} disabled={index === 0} icon={<ArrowUpRegular />} onClick={() => replaceEntries(moveEntry(entries, index, -1))} size="small" /></Tooltip>
            <Tooltip content={t("dashboard.upstreamEditor.actions.moveDown")} relationship="label"><Button appearance="subtle" aria-label={t("dashboard.upstreamEditor.actions.moveDown")} disabled={index === entries.length - 1} icon={<ArrowDownRegular />} onClick={() => replaceEntries(moveEntry(entries, index, 1))} size="small" /></Tooltip>
            <Tooltip content={t("dashboard.upstreamEditor.models.removePricingEntry")} relationship="label"><Button appearance="subtle" aria-label={t("dashboard.upstreamEditor.models.removePricingEntry")} icon={<DeleteRegular />} onClick={() => { replaceEntries(entries.filter((_, entryIndex) => entryIndex !== index)); setSelected(Math.max(0, index - 1)); }} size="small" /></Tooltip>
          </div>}
        </div>)}
        {entries.length === 0 && <Text size={200} className="text-fui-fg2 py-2">{t("dashboard.upstreamEditor.models.noPricingEntries")}</Text>}
        {editable && <Button
          appearance="secondary"
          className="mt-2"
          icon={<AddRegular />}
          onClick={() => {
            const base = entries.find((entry) => !entry.selector || Object.keys(entry.selector).length === 0);
            replaceEntries([...entries, { rates: { ...(base?.rates ?? {}) } }]);
            setSelected(entries.length);
          }}
          size="small"
        >{t("dashboard.upstreamEditor.models.addPricingEntry")}</Button>}
      </div>

      <div className="min-w-0 py-3 pl-4 max-[760px]:pl-0">
        {active ? <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
            <Field label={t("dashboard.upstreamEditor.models.serviceTier")} hint={t("dashboard.upstreamEditor.models.serviceTierHint")}>
              <Input
                readOnly={!editable}
                value={serviceTier}
                onChange={(_, data) => updateActive((entry) => {
                  const selector = selectorFor(entry);
                  const next = data.value.trim();
                  if (next) selector.serviceTier = next; else delete selector.serviceTier;
                  return { ...(Object.keys(selector).length ? { selector: selector as PricingSelector } : {}), rates: entry.rates };
                })}
              />
            </Field>
            <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 items-end">
              <Field label={t("dashboard.upstreamEditor.models.operator")}>
                <Select
                  disabled={!editable}
                  value={operator}
                  onChange={(_, data) => {
                    const nextOperator = data.value as PricingThresholdOperator;
                    setOperatorDrafts((current) => ({ ...current, [selected]: nextOperator }));
                    if (threshold) updateActive((entry) => ({ ...entry, selector: { ...(entry.selector ?? {}), inputTokens: { ...threshold, operator: nextOperator } } }));
                  }}
                ><option value="gt">&gt;</option><option value="gte">&gt;=</option></Select>
              </Field>
              <Field label={t("dashboard.upstreamEditor.models.inputTokens")} hint={t("dashboard.upstreamEditor.models.inputTokensHint")}>
                <Input
                  inputMode="numeric"
                  min={1}
                  readOnly={!editable}
                  type="number"
                  value={threshold?.value === undefined ? "" : String(threshold.value)}
                  onChange={(_, data) => updateActive((entry) => {
                    const selector = selectorFor(entry);
                    if (data.value === "") delete selector.inputTokens;
                    else selector.inputTokens = { operator, value: Number(data.value) };
                    return { ...(Object.keys(selector).length ? { selector: selector as PricingSelector } : {}), rates: entry.rates };
                  })}
                />
              </Field>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
            {visibleDimensions.map((dimension) => <Field key={dimension} label={t(dimensionKey(dimension))}>
              <Input
                min={0}
                readOnly={!editable}
                type="number"
                value={active.rates[dimension] === undefined ? "" : String(active.rates[dimension])}
                onChange={(_, data) => updateActive((entry) => {
                  const rates: PriceVector = { ...entry.rates };
                  if (data.value === "") delete rates[dimension]; else rates[dimension] = Number(data.value);
                  return { ...entry, rates };
                })}
              />
            </Field>)}
          </div>
        </div> : <Text size={200} className="text-fui-fg2">{t("dashboard.upstreamEditor.models.addPricingEntryHint")}</Text>}
      </div>
    </div>
    {issues.length > 0 && <div aria-label={t("dashboard.upstreamEditor.models.pricingErrors")} role="alert" className={`${styles.error} grid gap-1 text-fui-base200`}>
      {issues.map((issue, index) => <span key={`${issue.code}-${index}`}>{issue.error.message}</span>)}
    </div>}
  </div>;
}

const moveEntry = (entries: PricingEntry[], index: number, direction: -1 | 1) => {
  const target = index + direction;
  if (target < 0 || target >= entries.length) return entries;
  const next = [...entries];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
};
