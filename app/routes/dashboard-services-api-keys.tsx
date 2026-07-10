import { zodResolver } from "@hookform/resolvers/zod";
import {
  AddRegular,
  ArrowClockwiseRegular,
  ArrowDownRegular,
  ArrowUpRegular,
  CheckmarkRegular,
  CopyRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
} from "@fluentui/react-icons";
import claudeIconUrl from "../assets/claude-color.svg";
import codexIconUrl from "../assets/codex.svg";
import prismVscDarkPlusStyles from "prism-themes/themes/prism-vsc-dark-plus.css?url";
import prismVsStyles from "prism-themes/themes/prism-vs.css?url";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { redirect, useOutletContext } from "react-router";
import { z } from "zod";

import type { ApiKey, ControlPlaneModel, UpstreamProviderKind } from "../api/types";
import { authFetch, callApi } from "../api/auth";
import { getSessionToken } from "../auth/session";
import { CodeBlock } from "../components/code-block";
import { ConfirmDialog } from "../components/confirm-dialog";
import { DialogShell } from "../components/dialog-shell";
import { PageLoadingPanel } from "../components/page-loading-panel";
import { Panel } from "../components/panel";
import { ProviderBadge, providerLabel } from "../components/provider-badge";
import { fluentComponents } from "../fluent";
import type { DashboardOutletContext } from "./dashboard";
import type { Route } from "./+types/dashboard-services-api-keys";

const {
  Button,
  Checkbox,
  DialogActions,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Select,
  Spinner,
  Switch,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Toast,
  Toaster,
  ToastTitle,
  Tooltip,
  createTableColumn,
  makeStyles,
  useToastController,
  useTableColumnSizing_unstable,
  useTableFeatures,
  useTableSort,
} = fluentComponents;

const useStyles = makeStyles({
  selectedRow: { backgroundColor: "var(--colorBrandBackground2)" },
  selectedDot: { backgroundColor: "var(--colorBrandForeground1)" },
  accentText: { color: "var(--colorBrandForeground1)" },
  dangerText: { color: "var(--colorPaletteRedForeground1)" },
  fieldError: { color: "var(--colorPaletteRedForeground1)" },
});

type ApiKeyFormat = ApiKey["api_key_format"];
type RetentionPreset = "off" | "1h" | "6h" | "24h" | "7d" | "custom";

interface UpstreamOption {
  id: string;
  name: string;
  kind: UpstreamProviderKind;
  enabled: boolean;
}

interface ModelsResponse {
  object: string;
  data: ControlPlaneModel[];
}

interface ApiKeysPageData {
  keys: ApiKey[];
  upstreams: UpstreamOption[];
  models: ControlPlaneModel[];
  error: string | null;
}

interface KeyFormValues {
  name: string;
  keyFormat: ApiKeyFormat;
  customKey: string;
  upstreamOverride: boolean;
  upstreamIds: string[];
  retentionPreset: RetentionPreset;
  retentionCustom: string;
}

interface UpstreamRow {
  id: string;
  name: string;
  kind: UpstreamProviderKind | null;
  enabled: boolean;
}

interface CreateKeyBody {
  name: string;
  upstream_ids: string[] | null;
  dump_retention_seconds: number | null;
  key_format: ApiKeyFormat;
  custom_key?: string;
}

interface UpdateKeyBody {
  name: string;
  upstream_ids: string[] | null;
  dump_retention_seconds: number | null;
}

type ApiKeyMutation = "create" | "edit" | "rotate" | "delete";

interface MutationToastController {
  start: (kind: ApiKeyMutation, name: string) => string;
  succeed: (toastId: string, kind: ApiKeyMutation, name: string) => void;
  fail: (toastId: string, kind: ApiKeyMutation, name: string, message: string) => void;
}

const retentionPresetSeconds: Record<Exclude<RetentionPreset, "off" | "custom">, number> = {
  "1h": 3600,
  "6h": 6 * 3600,
  "24h": 24 * 3600,
  "7d": 7 * 86400,
};

const dumpRetentionMaxSeconds = 10 * 365 * 24 * 60 * 60;
const apiKeyPlaceholder = "<your-api-key>";
const claudeModelPattern = /(^|\/)claude-/;
const codexModelPattern = /(^|\/)gpt-5/;
const claudeTier: Record<string, number> = { opus: 0, sonnet: 1, haiku: 2 };

export async function clientLoader() {
  if (!getSessionToken()) throw redirect("/");
  return null;
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "API Keys | Floway" }];
}

export function links() {
  return [
    { rel: "stylesheet", href: prismVsStyles, media: "(prefers-color-scheme: light)" },
    { rel: "stylesheet", href: prismVscDarkPlusStyles, media: "(prefers-color-scheme: dark)" },
  ];
}

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
        <CliSnippet
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

function KeysTable({
  copiedTag, copyFailedTag, keys, onCopy, onDelete, onEdit, onRotate, onSelect, selectedKeyId, upstreams,
}: {
  copiedTag: string | null; copyFailedTag: string | null; keys: ApiKey[];
  onCopy: (text: string, tag: string) => void; onDelete: (key: ApiKey) => void;
  onEdit: (key: ApiKey) => void; onRotate: (key: ApiKey) => void;
  onSelect: (id: string) => void; selectedKeyId: string; upstreams: UpstreamOption[];
}) {
  const { t } = useTranslation();
  const s = useStyles();
  const upstreamById = useMemo(
    () => new Map(upstreams.map((upstream) => [upstream.id, upstream])),
    [upstreams],
  );

  const columns = useMemo(
    () => [
      createTableColumn<ApiKey>({
        columnId: "name", compare: (a, b) => a.name.localeCompare(b.name),
        renderHeaderCell: () => t("dashboard.apiKeys.table.name"),
        renderCell: (key) => (
          <TableCellLayout>
            <div className="inline-flex items-center gap-2 min-w-0">
              <span className={`rounded-full flex-none h-[7px] w-[7px] ${key.id === selectedKeyId ? s.selectedDot : "bg-transparent"}`} />
              <span className="truncate min-w-0">{key.name}</span>
            </div>
          </TableCellLayout>
        ),
      }),
      createTableColumn<ApiKey>({
        columnId: "key", renderHeaderCell: () => t("dashboard.apiKeys.table.key"),
        renderCell: (key) => (
          <code className="bg-fui-bg2 border border-fui-stroke1 rounded-md text-fui-fg2 inline-block font-mono text-xs max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap p-[2px_6px]">
            {truncateKey(key.key)}
          </code>
        ),
      }),
      createTableColumn<ApiKey>({
        columnId: "upstreams", renderHeaderCell: () => t("dashboard.apiKeys.table.upstreams"),
        renderCell: (key) => (
          <span
            className={
              !key.upstream_ids ? undefined
              : key.upstream_ids.length === 0 ? s.dangerText : s.accentText
            }
            title={upstreamsTitle(key, upstreamById, t)}
          >
            {upstreamsText(key, upstreamById, t)}
          </span>
        ),
      }),
      createTableColumn<ApiKey>({
        columnId: "created", compare: (a, b) => a.created_at.localeCompare(b.created_at),
        renderHeaderCell: () => t("dashboard.apiKeys.table.created"),
        renderCell: (key) => <span title={fullDateTime(key.created_at)}>{shortDate(key.created_at)}</span>,
      }),
      createTableColumn<ApiKey>({
        columnId: "lastUsed", compare: (a, b) => (a.last_used_at ?? "").localeCompare(b.last_used_at ?? ""),
        renderHeaderCell: () => t("dashboard.apiKeys.table.lastUsed"),
        renderCell: (key) => key.last_used_at
          ? <span title={fullDateTime(key.last_used_at)}>{relativeTime(key.last_used_at, t)}</span>
          : <span>{t("dashboard.apiKeys.table.never")}</span>,
      }),
      createTableColumn<ApiKey>({
        columnId: "actions", renderHeaderCell: () => t("dashboard.apiKeys.table.actions"),
        renderCell: (key) => {
          const copyTag = `key-${key.id}`;
          return (
            <div className="inline-flex items-center gap-[2px]" onClick={(event) => event.stopPropagation()}>
              <IconButton icon={copyFailedTag === copyTag ? <DismissRegular /> : copiedTag === copyTag ? <CheckmarkRegular /> : <CopyRegular />}
                label={copyFailedTag === copyTag ? t("dashboard.apiKeys.copy.failed") : copiedTag === copyTag ? t("dashboard.apiKeys.copy.copied") : t("dashboard.apiKeys.actions.copy")}
                onClick={() => onCopy(key.key, copyTag)} />
              <IconButton icon={<EditRegular />} label={t("dashboard.apiKeys.actions.edit")} onClick={() => onEdit(key)} />
              <IconButton icon={<ArrowClockwiseRegular />} label={t("dashboard.apiKeys.actions.rotate")} onClick={() => onRotate(key)} />
              <IconButton icon={<DeleteRegular />} label={t("dashboard.apiKeys.actions.delete")} onClick={() => onDelete(key)} />
            </div>
          );
        },
      }),
    ],
    [copiedTag, copyFailedTag, onCopy, onDelete, onEdit, onRotate, s, selectedKeyId, t, upstreamById],
  );

  const columnSizingOptions = useMemo(
    () => ({
      name: { defaultWidth: 180 }, key: { defaultWidth: 160 },
      upstreams: { defaultWidth: 240 }, actions: { defaultWidth: 200 },
    }), []);

  const { getRows, columnSizing_unstable, tableRef } = useTableFeatures(
    { columns, items: keys },
    [useTableSort({}), useTableColumnSizing_unstable({ columnSizingOptions })],
  );
  const rows = getRows();

  if (keys.length === 0) {
    return <Text size={300} className="text-fui-fg3 !m-0 text-center p-[18px_0]">{t("dashboard.apiKeys.empty")}</Text>;
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <Table ref={tableRef} {...columnSizing_unstable.getTableProps()} aria-label={t("dashboard.apiKeys.table.title")} sortable>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHeaderCell key={column.columnId} {...columnSizing_unstable.getTableHeaderCellProps(column.columnId)}>
                {column.renderHeaderCell()}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ item }) => (
            <TableRow className={item.id === selectedKeyId ? s.selectedRow : undefined} key={item.id} onClick={() => onSelect(item.id)}>
              {columns.map((column) => (
                <TableCell key={column.columnId} {...columnSizing_unstable.getTableCellProps(column.columnId)}>
                  {column.renderCell(item)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function KeyDialog({
  apiKey,
  mode,
  mutationToasts,
  onOpenChange,
  onSaved,
  open,
  upstreams,
  userUpstreamIds,
}: {
  apiKey: ApiKey | null;
  mode: "create" | "edit";
  mutationToasts: MutationToastController;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  open: boolean;
  upstreams: UpstreamOption[];
  userUpstreamIds: string[] | null;
}) {
  const { t } = useTranslation();
  const isCreate = mode === "create";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleUpstreams = useMemo(() => {
    if (userUpstreamIds === null) return upstreams;
    const allowed = new Set(userUpstreamIds);
    return upstreams.filter((upstream) => allowed.has(upstream.id));
  }, [upstreams, userUpstreamIds]);

  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, "dashboard.apiKeys.validation.nameRequired"),
          keyFormat: z.enum(["openai", "custom"]),
          customKey: z.string(),
          upstreamOverride: z.boolean(),
          upstreamIds: z.array(z.string()),
          retentionPreset: z.enum(["off", "1h", "6h", "24h", "7d", "custom"]),
          retentionCustom: z.string(),
        })
        .superRefine((value, ctx) => {
          if (value.upstreamOverride && value.upstreamIds.length === 0) {
            ctx.addIssue({
              code: "custom",
              message: "dashboard.apiKeys.validation.upstreamRequired",
              path: ["upstreamIds"],
            });
          }
          if (isCreate && value.keyFormat === "custom" && !value.customKey.trim()) {
            ctx.addIssue({
              code: "custom",
              message: "dashboard.apiKeys.validation.customKeyRequired",
              path: ["customKey"],
            });
          }
          if (
            value.retentionPreset === "custom" &&
            parseDuration(value.retentionCustom) === null
          ) {
            ctx.addIssue({
              code: "custom",
              message: "dashboard.apiKeys.validation.retentionInvalid",
              path: ["retentionCustom"],
            });
          }
        }),
    [isCreate],
  );

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<KeyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: keyFormDefaults(apiKey),
  });

  useEffect(() => {
    if (open) {
      reset(keyFormDefaults(apiKey));
      setError(null);
    }
  }, [apiKey, open, reset]);

  const values = watch();
  const proposedRetention = retentionSecondsFromForm(values);
  const retentionWarning = retentionWarningText(
    apiKey?.dump_retention_seconds ?? null,
    proposedRetention,
    t,
  );

  const save = async (values: KeyFormValues) => {
    const retention = retentionSecondsFromForm(values);
    if (retention === "invalid") return;

    setSaving(true);
    setError(null);
    const common = {
      name: values.name.trim(),
      upstream_ids: values.upstreamOverride ? values.upstreamIds : null,
      dump_retention_seconds: retention,
    };
    const mutationKind = isCreate ? "create" : "edit";
    const toastId = mutationToasts.start(mutationKind, common.name);
    const result = isCreate
      ? await callApi<ApiKey>(() =>
          authFetch("/api/keys", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ...common,
              key_format: values.keyFormat,
              ...(values.keyFormat === "custom"
                ? { custom_key: values.customKey.trim() }
                : {}),
            } satisfies CreateKeyBody),
          }),
        )
      : await callApi<ApiKey>(() =>
          authFetch(`/api/keys/${encodeURIComponent(apiKey!.id)}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(common satisfies UpdateKeyBody),
          }),
        );
    setSaving(false);

    if (result.error) {
      mutationToasts.fail(toastId, mutationKind, common.name, result.error.message);
      setError(result.error.message);
      return;
    }
    onOpenChange(false);
    mutationToasts.succeed(toastId, mutationKind, common.name);
    await onSaved();
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={(_, data) => onOpenChange(data.open)}
      onSubmit={handleSubmit(save)}
      title={
        <DialogTitle>
          {isCreate
            ? t("dashboard.apiKeys.dialog.createTitle")
            : t("dashboard.apiKeys.dialog.editTitle")}
        </DialogTitle>
      }
      actions={
        <DialogActions>
          <Button disabled={saving} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button appearance="primary" disabled={saving} type="submit">
            {saving
              ? t("dashboard.apiKeys.actions.saving")
              : isCreate
                ? t("dashboard.apiKeys.actions.create")
                : t("dashboard.apiKeys.actions.save")}
          </Button>
        </DialogActions>
      }
    >
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <Field
                  label={t("dashboard.apiKeys.form.name")}
                  validationMessage={errors.name?.message ? t(errors.name.message) : undefined}
                  validationState={errors.name ? "error" : undefined}
                >
                  <Input {...field} disabled={saving} />
                </Field>
              )}
            />

            <UpstreamPicker
              available={visibleUpstreams}
              disabled={saving}
              error={errors.upstreamIds?.message ? t(errors.upstreamIds.message) : null}
              ids={values.upstreamIds}
              override={values.upstreamOverride}
              onChange={(next) => {
                setValue("upstreamOverride", next.override, { shouldValidate: true });
                setValue("upstreamIds", next.ids, { shouldValidate: true });
              }}
            />

            {isCreate && (
              <div className="grid gap-3 grid-cols-2 min-w-0 max-[900px]:grid-cols-1">
                <Controller
                  control={control}
                  name="keyFormat"
                  render={({ field }) => (
                    <Field label={t("dashboard.apiKeys.form.format")}>
                      <Select {...field} disabled={saving}>
                        <option value="openai">
                          {t("dashboard.apiKeys.format.openai")}
                        </option>
                        <option value="custom">
                          {t("dashboard.apiKeys.format.custom")}
                        </option>
                      </Select>
                    </Field>
                  )}
                />
                {values.keyFormat === "custom" && (
                  <Controller
                    control={control}
                    name="customKey"
                    render={({ field }) => (
                      <Field
                        label={t("dashboard.apiKeys.form.customKey")}
                        validationMessage={
                          errors.customKey?.message ? t(errors.customKey.message) : undefined
                        }
                        validationState={errors.customKey ? "error" : undefined}
                      >
                        <Input
                          {...field}
                          disabled={saving}
                          placeholder={t("dashboard.apiKeys.form.customKeyPlaceholder")}
                        />
                      </Field>
                    )}
                  />
                )}
              </div>
            )}

            <div className="grid gap-3 grid-cols-2 min-w-0 max-[900px]:grid-cols-1">
              <Controller
                control={control}
                name="retentionPreset"
                render={({ field }) => (
                  <Field
                    hint={t("dashboard.apiKeys.form.retentionHint")}
                    label={t("dashboard.apiKeys.form.retention")}
                  >
                    <Select {...field} disabled={saving}>
                      <option value="off">{t("dashboard.apiKeys.retention.off")}</option>
                      <option value="1h">{t("dashboard.apiKeys.retention.1h")}</option>
                      <option value="6h">{t("dashboard.apiKeys.retention.6h")}</option>
                      <option value="24h">{t("dashboard.apiKeys.retention.24h")}</option>
                      <option value="7d">{t("dashboard.apiKeys.retention.7d")}</option>
                      <option value="custom">
                        {t("dashboard.apiKeys.retention.custom")}
                      </option>
                    </Select>
                  </Field>
                )}
              />
              {values.retentionPreset === "custom" && (
                <Controller
                  control={control}
                  name="retentionCustom"
                  render={({ field }) => (
                    <Field
                      label={t("dashboard.apiKeys.form.retentionCustom")}
                      validationMessage={
                        errors.retentionCustom?.message
                          ? t(errors.retentionCustom.message)
                          : undefined
                      }
                      validationState={errors.retentionCustom ? "error" : undefined}
                    >
                      <Input
                        {...field}
                        disabled={saving}
                        placeholder={t("dashboard.apiKeys.form.retentionPlaceholder")}
                      />
                    </Field>
                  )}
                />
              )}
            </div>

            {retentionWarning && (
              <MessageBar intent="warning">
                <MessageBarBody>{retentionWarning}</MessageBarBody>
              </MessageBar>
            )}

            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
    </DialogShell>
  );
}

function UpstreamPickerTable({
  columns, rows,
}: {
  columns: ReturnType<typeof createTableColumn<UpstreamRow>>[]; rows: UpstreamRow[];
}) {
  const upstreamSizingOptions = useMemo(
    () => ({
      enabled: { defaultWidth: 80, minWidth: 70 },
      order: { defaultWidth: 80, minWidth: 60 },
      kind: { defaultWidth: 140 },
    }),
    [],
  );
  const { getRows: getUpstreamRows, columnSizing_unstable: cs, tableRef: ref } = useTableFeatures(
    { columns, items: rows }, [
      useTableSort({}),
      useTableColumnSizing_unstable({ columnSizingOptions: upstreamSizingOptions }),
    ],
  );
  const upstreamRows = getUpstreamRows();
  return (
    <div className="min-w-0 overflow-x-auto">
      <Table ref={ref} {...cs.getTableProps()} aria-label="Upstreams" sortable>
        <TableHeader><TableRow>{columns.map((col) => (
          <TableHeaderCell key={col.columnId} {...cs.getTableHeaderCellProps(col.columnId)}>{col.renderHeaderCell()}</TableHeaderCell>
        ))}</TableRow></TableHeader>
        <TableBody>{upstreamRows.map(({ item }) => (
          <TableRow key={item.id}>{columns.map((col) => (
            <TableCell key={col.columnId} {...cs.getTableCellProps(col.columnId)}>{col.renderCell(item)}</TableCell>
          ))}</TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );
}

function UpstreamPicker({
  available,
  disabled,
  error,
  ids,
  onChange,
  override,
}: {
  available: UpstreamOption[];
  disabled: boolean;
  error: string | null;
  ids: string[];
  onChange: (value: { override: boolean; ids: string[] }) => void;
  override: boolean;
}) {
  const { t } = useTranslation();
  const s = useStyles();
  const rows = useMemo(() => upstreamRows(available, ids), [available, ids]);
  const selectedCount = override ? ids.length : available.length;
  const columns = useMemo(
    () => [
      createTableColumn<UpstreamRow>({
        columnId: "enabled",
        renderHeaderCell: () => t("dashboard.apiKeys.upstreams.enabled"),
        renderCell: (row) => (
          <Checkbox
            checked={row.enabled}
            disabled={disabled}
            onChange={(_, data) => toggleUpstream(row.id, !!data.checked)}
          />
        ),
      }),
      createTableColumn<UpstreamRow>({
        columnId: "order",
        renderHeaderCell: () => t("dashboard.apiKeys.upstreams.order"),
        renderCell: (row) => {
          const selectedIndex = ids.indexOf(row.id);
          return (
            <div className="inline-flex items-center gap-1">
              <IconButton
                disabled={disabled || selectedIndex <= 0}
                icon={<ArrowUpRegular />}
                label={t("dashboard.apiKeys.upstreams.moveUp")}
                onClick={() => moveUpstream(row.id, -1)}
              />
              <IconButton
                disabled={
                  disabled || selectedIndex === -1 || selectedIndex >= ids.length - 1
                }
                icon={<ArrowDownRegular />}
                label={t("dashboard.apiKeys.upstreams.moveDown")}
                onClick={() => moveUpstream(row.id, 1)}
              />
            </div>
          );
        },
      }),
      createTableColumn<UpstreamRow>({
        columnId: "name",
        compare: (a, b) => a.name.localeCompare(b.name),
        renderHeaderCell: () => t("dashboard.apiKeys.upstreams.name"),
        renderCell: (row) => (
          <TableCellLayout>
            <span className="truncate min-w-0">{row.name}</span>
          </TableCellLayout>
        ),
      }),
      createTableColumn<UpstreamRow>({
        columnId: "kind",
        compare: (a, b) => providerLabel(a.kind).localeCompare(providerLabel(b.kind)),
        renderHeaderCell: () => t("dashboard.apiKeys.upstreams.kind"),
        renderCell: (row) => <ProviderBadge kind={row.kind} />,
      }),
    ],
    [disabled, ids, t],
  );

  function toggleUpstream(id: string, enabled: boolean) {
    const nextIds = enabled
      ? [...new Set([...ids, id])]
      : ids.filter((candidate) => candidate !== id);
    onChange({ override: true, ids: nextIds });
  }

  function moveUpstream(id: string, direction: -1 | 1) {
    const index = ids.indexOf(id);
    const nextIndex = index + direction;
    if (index === -1 || nextIndex < 0 || nextIndex >= ids.length) return;
    const next = [...ids];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange({ override: true, ids: next });
  }

  return (
    <div className="grid gap-[10px] min-w-0">
      <div className="flex items-center gap-3 justify-between rounded-lg border border-fui-stroke1 bg-fui-bg2 p-[10px_12px]">
        <div>
          <span className="text-fui-fg1 text-[13px] font-650">
            {t("dashboard.apiKeys.upstreams.title", { count: selectedCount })}
          </span>
          <HintText>{t("dashboard.apiKeys.upstreams.inheritDescription")}</HintText>
        </div>
        <Switch
          checked={override}
          disabled={disabled}
          onChange={(_, data) => onChange({ override: !!data.checked, ids })}
        />
      </div>
      {error && <span className={`${s.fieldError} text-xs !m-0`}>{error}</span>}
      {override && <UpstreamPickerTable columns={columns} rows={rows} />}
    </div>
  );
}

function RotateCustomKeyDialog({
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

function CliSnippet({
  apiKey,
  copiedTag,
  selectedKey,
  models,
  onCopy,
}: {
  apiKey: string;
  copiedTag: string | null;
  selectedKey: ApiKey | null;
  models: ControlPlaneModel[];
  onCopy: (text: string, tag: string) => void;
}) {
  const { t } = useTranslation();
  const [activeSnippet, setActiveSnippet] = useState<"claude" | "codex">("claude");
  const [onlyClaudeModels, setOnlyClaudeModels] = useState(true);
  const [onlyGpt5Models, setOnlyGpt5Models] = useState(true);
  const baseUrl =
    typeof window === "undefined" ? "http://localhost:5173" : window.location.origin;
  const keyScopedModels = useMemo(
    () => modelsForApiKey(models, selectedKey),
    [models, selectedKey],
  );
  const chatIds = useMemo(
    () =>
      dedupe(
        keyScopedModels
          .filter((model) => model.kind === "chat")
          .map((model) => model.id),
      ),
    [keyScopedModels],
  );
  const claudeIds = useMemo(
    () =>
      dedupe(
        chatIds.filter((id) => !onlyClaudeModels || claudeModelPattern.test(id)),
      ),
    [chatIds, onlyClaudeModels],
  );
  const codexIds = useMemo(
    () =>
      dedupe(
        chatIds.filter((id) => !onlyGpt5Models || codexModelPattern.test(id)),
      ),
    [chatIds, onlyGpt5Models],
  );
  const claudeBig = useMemo(() => [...claudeIds].sort(sortClaudeBig), [claudeIds]);
  const claudeSonnet = useMemo(() => [...claudeIds].sort(sortClaudeSonnet), [claudeIds]);
  const claudeSmall = useMemo(() => [...claudeIds].sort(sortClaudeSmall), [claudeIds]);
  const codexModels = useMemo(() => [...codexIds].sort(sortCodex), [codexIds]);
  const [claudeModel, setClaudeModel] = useState("");
  const [sonnetModel, setSonnetModel] = useState("");
  const [haikuModel, setHaikuModel] = useState("");
  const [codexModel, setCodexModel] = useState("");

  useEffect(() => {
    setClaudeModel((current) => (claudeBig.includes(current) ? current : claudeBig[0] ?? ""));
    setSonnetModel((current) =>
      claudeSonnet.includes(current) ? current : claudeSonnet[0] ?? "",
    );
    setHaikuModel((current) =>
      claudeSmall.includes(current) ? current : defaultClaudeSmallModel(claudeSmall),
    );
    setCodexModel((current) =>
      codexModels.includes(current) ? current : codexModels[0] ?? "",
    );
  }, [claudeBig, claudeSmall, claudeSonnet, codexModels]);

  const contextById = useMemo(() => {
    const map = new Map<string, number>();
    for (const model of keyScopedModels) {
      if (!claudeModelPattern.test(model.id) || model.kind !== "chat") continue;
      const limits = model.limits;
      const context =
        limits?.max_context_window_tokens ??
        ((limits?.max_prompt_tokens ?? 0) + (limits?.max_output_tokens ?? 0));
      map.set(model.id, context);
    }
    return map;
  }, [keyScopedModels]);
  const addContext = (id: string) => ((contextById.get(id) ?? 0) >= 1_000_000 ? `${id}[1m]` : id);

  const claudeSnippet = [
    `export ANTHROPIC_BASE_URL=${baseUrl}`,
    `export ANTHROPIC_AUTH_TOKEN=${apiKey}`,
    claudeModel ? `export ANTHROPIC_MODEL=${addContext(claudeModel)}` : null,
    sonnetModel ? `export ANTHROPIC_DEFAULT_SONNET_MODEL=${addContext(sonnetModel)}` : null,
    haikuModel ? `export ANTHROPIC_DEFAULT_HAIKU_MODEL=${haikuModel}` : null,
  ].filter((line): line is string => line !== null).join("\n");

  const codexBaseUrl = `${baseUrl}/azure-api.codex`;
  const codexSnippet = [
    codexModel ? `model = "${codexModel}"` : null,
    codexModel ? 'model_provider = "floway"' : null,
    `chatgpt_base_url = "${codexBaseUrl}"`,
    "",
    "[model_providers.floway]",
    'name = "Floway"',
    `base_url = "${codexBaseUrl}"`,
    'wire_api = "responses"',
    "supports_websockets = true",
    "",
    "[features]",
    "apps = false",
  ].filter((line): line is string => line !== null).join("\n");
  const codexAuthCommand = codexAuthSnippet(baseUrl, apiKey);

  return (
    <div className="grid gap-[14px] min-w-0">
      <TabList
        className="ml-[-8px]"
        selectedValue={activeSnippet}
        onTabSelect={(_, data) => setActiveSnippet(data.value === "codex" ? "codex" : "claude")}
      >
        <ProviderTab value="claude" icon={<img alt="" src={claudeIconUrl} />} label={t("dashboard.apiKeys.configuration.claudeCode")} />
        <ProviderTab value="codex" icon={<img alt="" src={codexIconUrl} />} label={t("dashboard.apiKeys.configuration.codex")} />
      </TabList>

      {activeSnippet === "claude" ? (
        <div className="grid gap-[10px] min-w-0">
          <Checkbox
            checked={onlyClaudeModels}
            className="justify-self-start ml-[-8px]"
            label={t("dashboard.apiKeys.configuration.onlyClaudeModels")}
            onChange={(_, data) => setOnlyClaudeModels(!!data.checked)}
          />
          <div className="flex items-end flex-wrap gap-[10px] min-w-0">
            <SnippetSelect
              label={t("dashboard.apiKeys.configuration.model")}
              onChange={setClaudeModel}
              options={claudeBig}
              value={claudeModel}
            />
            <SnippetSelect
              label={t("dashboard.apiKeys.configuration.sonnet")}
              onChange={setSonnetModel}
              options={claudeSonnet}
              value={sonnetModel}
            />
            <SnippetSelect
              label={t("dashboard.apiKeys.configuration.haiku")}
              onChange={setHaikuModel}
              options={claudeSmall}
              value={haikuModel}
            />
          </div>
          <HintText>{t("dashboard.apiKeys.configuration.claudeHint")}</HintText>
          <CodeBlock
            code={claudeSnippet}
            copied={copiedTag === "snippet-claude"}
            language="bash"
            onCopy={() => onCopy(claudeSnippet, "snippet-claude")}
          />
        </div>
      ) : (
        <div className="grid gap-[10px] min-w-0">
          <Checkbox
            checked={onlyGpt5Models}
            className="justify-self-start ml-[-8px]"
            label={t("dashboard.apiKeys.configuration.onlyGpt5Models")}
            onChange={(_, data) => setOnlyGpt5Models(!!data.checked)}
          />
          <div className="flex items-end flex-wrap gap-[10px] min-w-0">
            <SnippetSelect
              label={t("dashboard.apiKeys.configuration.model")}
              onChange={setCodexModel}
              options={codexModels}
              value={codexModel}
            />
          </div>
          <HintText>{t("dashboard.apiKeys.configuration.codexConfigHint")}</HintText>
          <CodeBlock
            code={codexSnippet}
            copied={copiedTag === "snippet-codex-config"}
            language="toml"
            onCopy={() => onCopy(codexSnippet, "snippet-codex-config")}
          />
          <HintText>{t("dashboard.apiKeys.configuration.codexAuthHint")}</HintText>
          <CodeBlock
            code={codexAuthCommand}
            copied={copiedTag === "snippet-codex-auth"}
            language="bash"
            onCopy={() => onCopy(codexAuthCommand, "snippet-codex-auth")}
          />
        </div>
      )}
    </div>
  );
}

function SnippetSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="grid gap-1 min-w-[min(220px,100%)] [&_span]:text-fui-fg2 [&_span]:text-xs [&_span]:font-fui-semibold">
      <span>{label}</span>
      <Dropdown
        disabled={options.length === 0}
        onOptionSelect={(_, data) => onChange(data.optionValue ?? "")}
        selectedOptions={value ? [value] : []}
        value={value}
      >
        {options.length === 0 ? (
          <Option value="">{apiKeyPlaceholder}</Option>
        ) : (
          options.map((option) => (
            <Option key={option} value={option}>
              {option}
            </Option>
          ))
        )}
      </Dropdown>
    </label>
  );
}

function HintText({ children }: { children: string }) {
  return <Text size={200} className="text-fui-fg2 leading-[1.35] !m-0">{children}</Text>;
}

function ProviderTab({ value, icon, label }: { value: string; icon: React.ReactElement; label: string }) {
  return (
    <Tab value={value}>
      <span className="inline-flex items-center gap-[7px] min-w-0 [&_img]:block [&_img]:flex-none [&_img]:h-4 [&_img]:w-4">
        {icon}{label}
      </span>
    </Tab>
  );
}

function IconButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: React.ReactElement;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip content={label} relationship="label">
      <Button
        appearance="subtle"
        aria-label={label}
        disabled={disabled}
        icon={icon}
        onClick={onClick}
        size="small"
      />
    </Tooltip>
  );
}

const keyFormDefaults = (apiKey: ApiKey | null): KeyFormValues => {
  const retention = retentionPresetFromValue(apiKey?.dump_retention_seconds ?? null);
  return {
    name: apiKey?.name ?? "",
    keyFormat: apiKey?.api_key_format ?? "openai",
    customKey: "",
    upstreamOverride: apiKey?.upstream_ids !== null && apiKey?.upstream_ids !== undefined,
    upstreamIds: apiKey?.upstream_ids ?? [],
    retentionPreset: retention.preset,
    retentionCustom: retention.custom,
  };
};

const retentionPresetFromValue = (
  seconds: number | null,
): { preset: RetentionPreset; custom: string } => {
  if (seconds === null) return { preset: "off", custom: "" };
  for (const [preset, value] of Object.entries(retentionPresetSeconds)) {
    if (value === seconds) return { preset: preset as RetentionPreset, custom: "" };
  }
  if (seconds % 86400 === 0) return { preset: "custom", custom: `${seconds / 86400}d` };
  if (seconds % 3600 === 0) return { preset: "custom", custom: `${seconds / 3600}h` };
  if (seconds % 60 === 0) return { preset: "custom", custom: `${seconds / 60}m` };
  return { preset: "custom", custom: `${seconds}s` };
};

const retentionSecondsFromForm = (
  values: Pick<KeyFormValues, "retentionPreset" | "retentionCustom">,
): number | null | "invalid" => {
  if (values.retentionPreset === "off") return null;
  if (values.retentionPreset === "custom") {
    return parseDuration(values.retentionCustom) ?? "invalid";
  }
  return retentionPresetSeconds[values.retentionPreset];
};

const parseDuration = (value: string): number | null => {
  const trimmed = value.trim().toLowerCase();
  const match = /^(\d+)\s*([smhd])?$/.exec(trimmed);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const unit = match[2] ?? "s";
  const multiplier = unit === "d" ? 86400 : unit === "h" ? 3600 : unit === "m" ? 60 : 1;
  const seconds = amount * multiplier;
  return seconds <= dumpRetentionMaxSeconds ? seconds : null;
};

const retentionWarningText = (
  previous: number | null,
  next: number | null | "invalid",
  t: ReturnType<typeof useTranslation>["t"],
) => {
  if (previous === null || next === "invalid") return null;
  if (next === null) return t("dashboard.apiKeys.retention.warningDisable");
  if (next < previous) return t("dashboard.apiKeys.retention.warningShrink");
  return null;
};

const upstreamRows = (available: UpstreamOption[], ids: string[]): UpstreamRow[] => {
  const selected = new Set(ids);
  return [
    ...ids.map((id) => {
      const upstream = available.find((candidate) => candidate.id === id);
      return {
        id,
        name: upstream?.name ?? `Unknown (${id})`,
        kind: upstream?.kind ?? null,
        enabled: true,
      };
    }),
    ...available
      .filter((upstream) => !selected.has(upstream.id))
      .map((upstream) => ({
        id: upstream.id,
        name: upstream.name,
        kind: upstream.kind,
        enabled: false,
      })),
  ];
};

const truncateKey = (key: string) =>
  key.length <= 14 ? key : `${key.slice(0, 7)}...${key.slice(-4)}`;

const shortDate = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))
    : "";

const fullDateTime = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(value))
    : "";

const relativeTime = (
  value: string,
  t: ReturnType<typeof useTranslation>["t"],
) => {
  const diffSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60) return formatter.format(diffSeconds, "second");
  if (abs < 3600) return formatter.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return formatter.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 2592000) return formatter.format(Math.round(diffSeconds / 86400), "day");
  return t("dashboard.apiKeys.table.usedOn", { date: shortDate(value) });
};

const upstreamsText = (
  key: ApiKey,
  upstreamById: Map<string, UpstreamOption>,
  t: ReturnType<typeof useTranslation>["t"],
) => {
  if (!key.upstream_ids) return t("dashboard.apiKeys.upstreams.all");
  if (key.upstream_ids.length === 0) return t("dashboard.apiKeys.upstreams.none");
  const names = key.upstream_ids.map((id) => upstreamById.get(id)?.name ?? id);
  return names.length <= 2
    ? names.join(", ")
    : t("dashboard.apiKeys.upstreams.summary", {
        first: names.slice(0, 2).join(", "),
        count: names.length - 2,
      });
};

const upstreamsTitle = (
  key: ApiKey,
  upstreamById: Map<string, UpstreamOption>,
  t: ReturnType<typeof useTranslation>["t"],
) => {
  if (!key.upstream_ids) return t("dashboard.apiKeys.upstreams.inheritsTitle");
  if (key.upstream_ids.length === 0) return t("dashboard.apiKeys.upstreams.none");
  return key.upstream_ids.map((id) => upstreamById.get(id)?.name ?? id).join("\n");
};

const modelsForApiKey = (models: ControlPlaneModel[], key: ApiKey | null) => {
  if (!key?.upstream_ids) return models;
  if (key.upstream_ids.length === 0) return [];
  const allowed = new Set(key.upstream_ids);
  return models.filter((model) =>
    model.upstreams.some((upstream) => allowed.has(upstream.id)),
  );
};

const tierOfClaude = (id: string) => {
  for (const tier of Object.keys(claudeTier)) {
    if (id.includes(tier)) return claudeTier[tier]!;
  }
  return 99;
};

const knownClaudeFamilyRank = (id: string) =>
  tierOfClaude(id) === 99 ? 1 : 0;

const sortClaudeBig = (a: string, b: string) => {
  const knownDiff = knownClaudeFamilyRank(a) - knownClaudeFamilyRank(b);
  if (knownDiff !== 0) return knownDiff;
  const tierDiff = tierOfClaude(a) - tierOfClaude(b);
  return tierDiff !== 0 ? tierDiff : b.localeCompare(a);
};

const sortClaudeSmall = (a: string, b: string) => {
  const knownDiff = knownClaudeFamilyRank(a) - knownClaudeFamilyRank(b);
  if (knownDiff !== 0) return knownDiff;
  const tierDiff = tierOfClaude(b) - tierOfClaude(a);
  return tierDiff !== 0 ? tierDiff : b.localeCompare(a);
};

const sortClaudeSonnet = (a: string, b: string) => {
  const knownDiff = knownClaudeFamilyRank(a) - knownClaudeFamilyRank(b);
  if (knownDiff !== 0) return knownDiff;
  const diffA = Math.abs(tierOfClaude(a) - claudeTier.sonnet!);
  const diffB = Math.abs(tierOfClaude(b) - claudeTier.sonnet!);
  return diffA !== diffB ? diffA - diffB : b.localeCompare(a);
};

const defaultClaudeSmallModel = (models: string[]) =>
  models.find((id) => id.includes("haiku")) ??
  models.find((id) => id.includes("sonnet")) ??
  models[0] ??
  "";

const sortCodex = (a: string, b: string) => {
  const miniA = a.includes("mini") ? 1 : 0;
  const miniB = b.includes("mini") ? 1 : 0;
  return miniA !== miniB ? miniA - miniB : b.localeCompare(a);
};

const dedupe = (items: string[]) => [...new Set(items)];

const codexAuthSnippet = (baseUrl: string, apiKey: string) => {
  const host = (() => {
    try {
      return new URL(baseUrl).host;
    } catch {
      return "local";
    }
  })();
  const b64url = (value: string) =>
    btoa(value).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header = b64url('{"alg":"none","typ":"JWT"}');
  const payload = b64url(
    JSON.stringify({
      email: `floway@${host}`,
      "https://api.openai.com/auth": {
        chatgpt_plan_type: "pro_plus",
        chatgpt_user_id: "user-floway",
        chatgpt_account_id: "acct-floway",
      },
    }),
  );
  const auth = {
    auth_mode: "chatgpt",
    openai_api_key: null,
    tokens: {
      id_token: `${header}.${payload}.c2ln`,
      access_token: apiKey,
      refresh_token: "noop",
    },
    last_refresh: "__LAST_REFRESH__",
  };
  const json = JSON.stringify(auth).replace(
    '"__LAST_REFRESH__"',
    '"$(date -u +%Y-%m-%dT%H:%M:%SZ)"',
  );
  return [
    "mkdir -p ~/.codex && \\",
    "  { [ -f ~/.codex/auth.json ] && cp ~/.codex/auth.json ~/.codex/auth.json.bak.$(date +%s); :; } && \\",
    "  cat > ~/.codex/auth.json <<EOF",
    json,
    "EOF",
  ].join("\n");
};
