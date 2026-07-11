import { AddRegular } from "@fluentui/react-icons";
import prismVscDarkPlusStyles from "prism-themes/themes/prism-vsc-dark-plus.css?url";
import prismVsStyles from "prism-themes/themes/prism-vs.css?url";
import { useEffect, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { redirect, useOutletContext } from "react-router";

import type { ApiKey, ControlPlaneModel } from "../api/types";
import { authFetch, callApi } from "../api/auth";
import { getSessionToken } from "../auth/session";
import { CliConfiguration } from "../components/api-keys/cli-configuration";
import { KeyDialog } from "../components/api-keys/key-editor";
import { RotateCustomKeyDialog } from "../components/api-keys/rotate-key-dialog";
import { KeysTable } from "../components/api-keys/keys-table";
import type { ApiKeysPageData, MutationToastController, UpstreamOption } from "../components/api-keys/types";
import { ConfirmDialog } from "../components/confirm-dialog";
import { PageLoadingPanel } from "../components/page-loading-panel";
import { Panel } from "../components/panel";
import { fluentComponents } from "../fluent";
import type { Route } from "./+types/dashboard-services-api-keys";
import type { DashboardOutletContext } from "./dashboard";

const { Button, MessageBar, MessageBarBody, Spinner, Text, Toast, Toaster, ToastTitle, useToastController } = fluentComponents;
interface ModelsResponse { object: string; data: ControlPlaneModel[] }
const apiKeyPlaceholder = "<your-api-key>";

export async function clientLoader() { if (!getSessionToken()) throw redirect("/"); return null; }
export function meta({}: Route.MetaArgs) { return [{ title: "API Keys | Floway" }]; }
export function links() { return [{ rel: "stylesheet", href: prismVsStyles, media: "(prefers-color-scheme: light)" }, { rel: "stylesheet", href: prismVscDarkPlusStyles, media: "(prefers-color-scheme: dark)" }]; }

export default function DashboardServicesApiKeys() {
  const { t } = useTranslation();
  const { user } = useOutletContext<DashboardOutletContext>();
  const toasterId = useId();
  const mutationToastId = useId();
  const mutationToastSequence = useRef(0);
  const { dispatchToast, updateToast } = useToastController(toasterId);
  const [data, setData] = useState<ApiKeysPageData>({
    keys: [],
    upstreams: [],
    models: [],
    error: null,
  });
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiKey | null>(null);
  const [rotateGeneratedTarget, setRotateGeneratedTarget] = useState<ApiKey | null>(null);
  const [rotateTarget, setRotateTarget] = useState<ApiKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [deleteSnapName, setDeleteSnapName] = useState("");
  const [rotateGenSnapName, setRotateGenSnapName] = useState("");
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [copyFailedTag, setCopyFailedTag] = useState<string | null>(null);

  const selectedKey =
    data.keys.find((key) => key.id === selectedKeyId) ?? data.keys[0] ?? null;
  const configurationKey = selectedKey?.key ?? apiKeyPlaceholder;

  const mutationToasts: MutationToastController = {
    start: (kind, name) => {
      const toastId = `${mutationToastId}-${mutationToastSequence.current++}`;
      dispatchToast(
        <Toast>
          <ToastTitle media={<Spinner size="tiny" />}>
            {t(`dashboard.apiKeys.toast.${kind}.pending`, { name })}
          </ToastTitle>
        </Toast>,
        { toastId, timeout: -1 },
      );
      return toastId;
    },
    succeed: (toastId, kind, name) => {
      updateToast({
        content: (
          <Toast>
            <ToastTitle>{t(`dashboard.apiKeys.toast.${kind}.success`, { name })}</ToastTitle>
          </Toast>
        ),
        intent: "success",
        toastId,
        timeout: 3000,
      });
    },
    fail: (toastId, kind, name, message) => {
      updateToast({
        content: (
          <Toast>
            <ToastTitle>
              {t(`dashboard.apiKeys.toast.${kind}.error`, { name, message })}
            </ToastTitle>
          </Toast>
        ),
        intent: "error",
        toastId,
        timeout: 5000,
      });
    },
  };

  const reload = async () => {
    setLoading(true);
    setPageError(null);
    const [keysRes, upstreamsRes, modelsRes] = await Promise.all([
      callApi<ApiKey[]>(() => authFetch("/api/keys")),
      callApi<UpstreamOption[]>(() => authFetch("/api/upstream-options")),
      callApi<ModelsResponse>(() => authFetch("/api/models")),
    ]);
    setLoading(false);

    const error =
      keysRes.error?.message ??
      upstreamsRes.error?.message ??
      modelsRes.error?.message ??
      null;
    setPageError(error);
    if (keysRes.error) return;

    const next = {
      keys: keysRes.data,
      upstreams: upstreamsRes.data ?? data.upstreams,
      models: modelsRes.data?.data ?? data.models,
      error,
    };
    setData(next);
    setSelectedKeyId((current) =>
      next.keys.some((key) => key.id === current) ? current : next.keys[0]?.id ?? "",
    );
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [keysRes, upstreamsRes, modelsRes] = await Promise.all([
        callApi<ApiKey[]>(() => authFetch("/api/keys")),
        callApi<UpstreamOption[]>(() => authFetch("/api/upstream-options")),
        callApi<ModelsResponse>(() => authFetch("/api/models")),
      ]);
      if (cancelled) return;

      const error =
        keysRes.error?.message ??
        upstreamsRes.error?.message ??
        modelsRes.error?.message ??
        null;
      const next: ApiKeysPageData = {
        keys: keysRes.data ?? [],
        upstreams: upstreamsRes.data ?? [],
        models: modelsRes.data?.data ?? [],
        error,
      };
      setData(next);
      setSelectedKeyId(next.keys[0]?.id ?? "");
      setPageError(error);
      setInitialLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyToClipboard = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTag(tag);
      window.setTimeout(() => {
        setCopiedTag((current) => (current === tag ? null : current));
      }, 1500);
    } catch {
      setCopyFailedTag(tag);
      window.setTimeout(() => {
        setCopyFailedTag((current) => (current === tag ? null : current));
      }, 2000);
    }
  };

  const rotateGeneratedKey = async (key: ApiKey) => {
    setPageError(null);
    const toastId = mutationToasts.start("rotate", key.name);
    const result = await callApi<ApiKey>(() =>
      authFetch(`/api/keys/${encodeURIComponent(key.id)}/rotate`, {
        method: "POST",
      }),
    );
    if (result.error) {
      mutationToasts.fail(toastId, "rotate", key.name, result.error.message);
      setPageError(result.error.message);
      return;
    }
    mutationToasts.succeed(toastId, "rotate", key.name);
    await reload();
  };

  const deleteKey = async (key: ApiKey) => {
    setPageError(null);
    const toastId = mutationToasts.start("delete", key.name);
    const result = await callApi<{ ok: true }>(() =>
      authFetch(`/api/keys/${encodeURIComponent(key.id)}`, { method: "DELETE" }),
    );
    if (result.error) {
      mutationToasts.fail(toastId, "delete", key.name, result.error.message);
      setPageError(result.error.message);
      return;
    }
    setDeleteTarget(null);
    mutationToasts.succeed(toastId, "delete", key.name);
    await reload();
  };

  return (
    <div className="grid gap-[18px] min-w-0">
      <Toaster toasterId={toasterId} position="top-end" />

      <header className="flex items-start gap-[18px] justify-between min-w-0 max-[900px]:flex-col max-[900px]:items-stretch">
        <div className="grid gap-1 min-w-0">
          <Text size={200} weight="semibold" className="text-fui-fg2 leading-[1.2]">
            {t("dashboard.groups.services")}
          </Text>
          <Text size={700} weight="semibold">
            {t("dashboard.nav.apiKeys")}
          </Text>
          <Text size={300} className="text-fui-fg2 leading-[1.45] max-w-[760px]">
            {t("dashboard.pages.apiKeys")}
          </Text>
        </div>
        <div className="flex items-center flex-none max-[900px]:justify-start">
          <Button
            appearance="primary"
            disabled={initialLoading}
            icon={<AddRegular />}
            onClick={() => setCreateOpen(true)}
          >
            {t("dashboard.apiKeys.actions.create")}
          </Button>
        </div>
      </header>

      {initialLoading ? (
        <PageLoadingPanel label={t("common.loading")} />
      ) : (
        <>
          {pageError && (
            <MessageBar intent="error">
              <MessageBarBody>{pageError}</MessageBarBody>
            </MessageBar>
          )}

      <Panel className="grid gap-[14px] min-w-0 !p-[18px]">
        <div className="flex items-center gap-3 justify-between min-w-0 max-[900px]:flex-col max-[900px]:items-stretch">
          <Text size={200} weight="semibold" className="text-fui-fg2 leading-[1.2]">
            {t("dashboard.apiKeys.table.title")}
          </Text>
          {loading && (
            <span className="text-xs text-fui-fg2 inline-flex items-center gap-[6px]">
              <Spinner size="tiny" />
              {t("dashboard.apiKeys.loading")}
            </span>
          )}
        </div>
        <KeysTable
          copiedTag={copiedTag}
          copyFailedTag={copyFailedTag}
          keys={data.keys}
          onCopy={copyToClipboard}
          onDelete={(key) => { setDeleteSnapName(key.name); setDeleteTarget(key); }}
          onEdit={setEditTarget}
          onRotate={(key) =>
            key.api_key_format === "custom"
              ? setRotateTarget(key)
              : (setRotateGenSnapName(key.name), setRotateGeneratedTarget(key))
          }
          onSelect={setSelectedKeyId}
          selectedKeyId={selectedKey?.id ?? ""}
          upstreams={data.upstreams}
        />
      </Panel>

      <Panel className="grid gap-[14px] min-w-0 !p-[18px]">
        <div className="flex items-center gap-3 justify-between min-w-0 max-[900px]:flex-col max-[900px]:items-stretch">
          <div className="grid gap-[5px] min-w-0">
            <Text size={500} weight="semibold" className="text-fui-fg1 leading-[1.25]">
              {t("dashboard.apiKeys.configuration.title")}
            </Text>
            {selectedKey && (
              <Text size={200} className="text-fui-fg2">
                <Trans
                  components={{ strong: <strong className="font-fui-semibold" /> }}
                  i18nKey="dashboard.apiKeys.configuration.selected"
                  values={{ name: selectedKey.name }}
                />
              </Text>
            )}
          </div>
        </div>
        <CliConfiguration
          apiKey={configurationKey}
          copiedTag={copiedTag}
          selectedKey={selectedKey}
          models={data.models}
          onCopy={copyToClipboard}
        />
      </Panel>

      <KeyDialog
        apiKey={null}
        mode="create"
        onOpenChange={setCreateOpen}
        onSaved={reload}
        mutationToasts={mutationToasts}
        open={createOpen}
        upstreams={data.upstreams}
        userUpstreamIds={user.upstreamIds}
      />
      <KeyDialog
        apiKey={editTarget}
        mode="edit"
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onSaved={reload}
        mutationToasts={mutationToasts}
        open={editTarget !== null}
        upstreams={data.upstreams}
        userUpstreamIds={user.upstreamIds}
      />
      <RotateCustomKeyDialog
        apiKey={rotateTarget}
        onOpenChange={(open) => {
          if (!open) setRotateTarget(null);
        }}
        onSaved={reload}
        mutationToasts={mutationToasts}
        open={rotateTarget !== null}
      />
      <ConfirmDialog
        actionLabel={t("dashboard.apiKeys.actions.rotate")}
        message={t("dashboard.apiKeys.rotate.generatedMessage", {
          name: rotateGenSnapName,
        })}
        onConfirm={() => {
          if (rotateGeneratedTarget) {
            const target = rotateGeneratedTarget;
            setRotateGeneratedTarget(null);
            void rotateGeneratedKey(target);
          }
        }}
        onOpenChange={(open) => {
          if (!open) setRotateGeneratedTarget(null);
        }}
        open={rotateGeneratedTarget !== null}
        title={t("dashboard.apiKeys.rotate.generatedTitle")}
      />
      <ConfirmDialog
        actionLabel={t("dashboard.apiKeys.actions.delete")}
        message={t("dashboard.apiKeys.delete.message", {
          name: deleteSnapName,
        })}
        onConfirm={() => {
          if (deleteTarget) void deleteKey(deleteTarget);
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        open={deleteTarget !== null}
        title={t("dashboard.apiKeys.delete.title")}
      />
        </>
      )}
    </div>
  );
}
