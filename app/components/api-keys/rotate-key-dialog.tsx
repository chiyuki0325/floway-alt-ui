import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ApiKey } from "../../api/types";
import { authFetch, callApi } from "../../api/auth";
import { fluentComponents } from "../../fluent";
import { DialogShell } from "../dialog-shell";
import { Input } from "../fluent-form-controls";
import type { MutationToastController } from "./types";
const { Button, DialogActions, DialogTitle, Field, Text } = fluentComponents;

export function RotateCustomKeyDialog({
  apiKey,
  mutationToasts,
  onOpenChange,
  onSaved,
  open,
}: {
  apiKey: ApiKey | null;
  mutationToasts: MutationToastController;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  open: boolean;
}) {
  const { t } = useTranslation();
  const [customKey, setCustomKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapName, setSnapName] = useState("");

  useEffect(() => {
    if (open) {
      setCustomKey("");
      setError(null);
      if (apiKey) setSnapName(apiKey.name);
    }
  }, [open, apiKey]);

  const rotate = async () => {
    if (!apiKey) return;
    const trimmed = customKey.trim();
    if (!trimmed) {
      setError(t("dashboard.apiKeys.validation.customKeyRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    const toastId = mutationToasts.start("rotate", snapName);
    const result = await callApi<ApiKey>(() =>
      authFetch(`/api/keys/${encodeURIComponent(apiKey.id)}/rotate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ custom_key: trimmed }),
      }),
    );
    setSaving(false);
    if (result.error) {
      mutationToasts.fail(toastId, "rotate", snapName, result.error.message);
      setError(result.error.message);
      return;
    }
    onOpenChange(false);
    mutationToasts.succeed(toastId, "rotate", snapName);
    await onSaved();
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={(_, data) => onOpenChange(data.open)}
      title={<DialogTitle>{t("dashboard.apiKeys.rotate.title")}</DialogTitle>}
      actions={
        <DialogActions>
          <Button disabled={saving} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button appearance="primary" disabled={saving} onClick={() => void rotate()}>
            {saving ? t("dashboard.apiKeys.actions.saving") : t("dashboard.apiKeys.actions.rotate")}
          </Button>
        </DialogActions>
      }
    >
      <Text size={200} className="text-fui-fg2 leading-[1.35] !m-0">
        {t("dashboard.apiKeys.rotate.message", { name: snapName })}
      </Text>
      <Field
        label={t("dashboard.apiKeys.form.customKey")}
        validationMessage={error ?? undefined}
        validationState={error ? "error" : undefined}
      >
        <Input
          disabled={saving}
          onChange={(_, data) => setCustomKey(data.value)}
          placeholder={t("dashboard.apiKeys.form.customKeyPlaceholder")}
          value={customKey}
        />
      </Field>
    </DialogShell>
  );
}
