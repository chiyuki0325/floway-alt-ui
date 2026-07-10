import {
  DeleteRegular,
  DismissRegular,
  EditRegular,
  ImageRegular,
  SendRegular,
  StopRegular,
} from "@fluentui/react-icons";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { redirect } from "react-router";
import { useTranslation } from "react-i18next";

import type { Route } from "./+types/dashboard-playground";
import type { ApiKey, ControlPlaneModel } from "../api/types";
import { authFetch, callApi } from "../api/auth";
import { getSessionToken } from "../auth/session";
import {
  availableModels,
  createWireFetch,
  generationOptions,
  maximumOutputTokens,
  parseCustomJson,
  playgroundApis,
  supportsImageInput,
  toModelMessages,
  type PlaygroundApi,
  type PlaygroundMessage,
  type PlaygroundSettings,
} from "../components/playground/playground-logic";
import { SegmentedControl } from "../components/segmented-control";
import { fluentComponents } from "../fluent";
import { useDashboardOutletContext } from "./dashboard";

const {
  Button,
  Combobox,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Select,
  SpinButton,
  Spinner,
  Switch,
  Text,
  Textarea,
  Tooltip,
  makeStyles,
  tokens,
} = fluentComponents;

interface ModelsResponse { data: ControlPlaneModel[] }
interface LoaderData { keys: ApiKey[]; models: ControlPlaneModel[]; error: string | null }

export async function clientLoader(): Promise<LoaderData> {
  if (!getSessionToken()) throw redirect("/");
  const [keys, models] = await Promise.all([
    callApi<ApiKey[]>(() => authFetch("/api/keys")),
    callApi<ModelsResponse>(() => authFetch("/api/models")),
  ]);
  return {
    keys: keys.data ?? [],
    models: models.data?.data ?? [],
    error: keys.error?.message ?? models.error?.message ?? null,
  };
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Playground | Floway" }];
}

const useStyles = makeStyles({
  shell: { border: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground1 },
  settings: { borderLeft: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground2 },
  toolbar: { borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
  composer: { borderTop: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground1 },
  userBubble: { backgroundColor: tokens.colorBrandBackground2, border: `1px solid ${tokens.colorBrandStroke2}` },
  assistantBubble: { backgroundColor: tokens.colorNeutralBackground2, border: `1px solid ${tokens.colorNeutralStroke2}` },
  messageActions: { opacity: 0, transitionProperty: "opacity", transitionDuration: tokens.durationFaster },
  messageRow: { "&:hover .playground-message-actions, &:focus-within .playground-message-actions": { opacity: 1 } },
  code: { fontFamily: tokens.fontFamilyMonospace },
});

const randomId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export default function DashboardPlayground({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { user } = useDashboardOutletContext();
  const s = useStyles();
  const [api, setApi] = useState<PlaygroundApi>("responses");
  const [keyId, setKeyId] = useState(loaderData.keys[0]?.id ?? "");
  const [modelId, setModelId] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [messages, setMessages] = useState<PlaygroundMessage[]>([]);
  const [system, setSystem] = useState("");
  const [draft, setDraft] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [showImage, setShowImage] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const [sending, setSending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [customDrafts, setCustomDrafts] = useState<Record<PlaygroundApi, string>>({
    responses: "{}", chatCompletions: "{}", messages: "{}",
  });
  const [customError, setCustomError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlaygroundSettings>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editImage, setEditImage] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedKey = loaderData.keys.find((key) => key.id === keyId) ?? null;
  const models = useMemo(
    () => availableModels(loaderData.models, selectedKey, user.upstreamIds, api),
    [api, loaderData.models, selectedKey, user.upstreamIds],
  );
  const selectedModel = models.find((model) => model.id === modelId) ?? models[0] ?? null;
  const imageEnabled = supportsImageInput(selectedModel);
  const outputLimit = maximumOutputTokens(selectedModel);
  const effortOptions = selectedModel?.chat?.reasoning?.effort?.supported ?? [];
  const matchingModels = models.filter((model) => {
    const query = modelQuery.trim().toLowerCase();
    return !query || model.id.toLowerCase().includes(query) || model.display_name.toLowerCase().includes(query);
  });

  const stop = useCallback(() => abortRef.current?.abort(), []);

  useEffect(() => {
    if (selectedModel && selectedModel.id !== modelId) setModelId(selectedModel.id);
    if (!selectedModel && modelId) setModelId("");
  }, [modelId, selectedModel]);

  useEffect(() => {
    if (!imageEnabled) {
      setShowImage(false);
      setImageUrl("");
    }
  }, [imageEnabled]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const changeContext = (change: () => void) => {
    stop();
    setRequestError(null);
    setCustomError(null);
    change();
  };

  const send = async () => {
    const text = draft.trim();
    const image = imageUrl.trim();
    if (sending || !selectedKey || !selectedModel || (!text && !image)) return;
    if (image && !imageEnabled) {
      setRequestError(t("dashboard.playground.errors.imageUnsupported"));
      return;
    }
    if (image) {
      try { new URL(image); } catch {
        setRequestError(t("dashboard.playground.errors.imageUrl"));
        return;
      }
    }
    const customResult = parseCustomJson(api, customDrafts[api]);
    if (customResult.error) {
      const message = customResult.error === "reserved"
        ? t("dashboard.playground.errors.customReserved", { fields: customResult.fields?.join(", ") })
        : t(`dashboard.playground.errors.custom${customResult.error === "invalid" ? "Invalid" : "Object"}`);
      setCustomError(message);
      return;
    }

    const userMessage: PlaygroundMessage = { id: randomId(), role: "user", text, ...(image && { imageUrl: image }) };
    const context = [...messages, userMessage];
    setMessages(context);
    setDraft("");
    setImageUrl("");
    setShowImage(false);
    setSending(true);
    setRequestError(null);
    setCustomError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const wireFetch = createWireFetch(customResult.value);
      const model = api === "messages"
        ? createAnthropic({ baseURL: "/v1", apiKey: selectedKey.key, fetch: wireFetch })(selectedModel.id)
        : api === "chatCompletions"
          ? createOpenAI({ baseURL: "/v1", apiKey: selectedKey.key, fetch: wireFetch }).chat(selectedModel.id)
          : createOpenAI({ baseURL: "/v1", apiKey: selectedKey.key, fetch: wireFetch }).responses(selectedModel.id);
      const options = {
        model,
        messages: toModelMessages(context),
        ...(system.trim() && { system: system.trim() }),
        abortSignal: controller.signal,
        ...generationOptions(api, settings),
      };

      if (streaming) {
        const assistantId = randomId();
        let assistantText = "";
        const result = streamText(options);
        for await (const delta of result.textStream) {
          assistantText += delta;
          setMessages((current) => {
            const existing = current.findIndex((message) => message.id === assistantId);
            if (existing < 0) return [...current, { id: assistantId, role: "assistant", text: assistantText }];
            return current.map((message) => message.id === assistantId ? { ...message, text: assistantText } : message);
          });
        }
        if (!assistantText && !controller.signal.aborted) {
          setMessages((current) => [...current, { id: assistantId, role: "assistant", text: t("dashboard.playground.emptyResponse") }]);
        }
      } else {
        const result = await generateText(options);
        setMessages((current) => [...current, {
          id: randomId(), role: "assistant", text: result.text || t("dashboard.playground.emptyResponse"),
        }]);
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError") && !controller.signal.aborted) {
        setRequestError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setSending(false);
      }
    }
  };

  const clearMessages = () => {
    stop();
    setMessages([]);
    setEditingId(null);
    setRequestError(null);
  };

  const beginEdit = (message: PlaygroundMessage) => {
    stop();
    setEditingId(message.id);
    setEditText(message.text);
    setEditImage(message.imageUrl ?? "");
  };

  const saveEdit = (id: string) => {
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === id);
      if (index < 0) return current;
      return current.slice(0, index + 1).map((message) => message.id === id
        ? { ...message, text: editText.trim(), ...(message.role === "user" && editImage.trim() ? { imageUrl: editImage.trim() } : { imageUrl: undefined }) }
        : message);
    });
    setEditingId(null);
  };

  const removeMessage = (id: string) => {
    stop();
    setMessages((current) => current.slice(0, current.findIndex((message) => message.id === id)));
    setEditingId(null);
  };

  const canSend = Boolean(selectedKey && selectedModel && (draft.trim() || imageUrl.trim()));

  return (
    <section className={`h-full min-h-[560px] min-w-0 overflow-hidden rounded-lg grid grid-cols-[minmax(0,1fr)_360px] ${s.shell}`}>
      <div className="min-h-0 min-w-0 grid grid-rows-[auto_auto_minmax(0,1fr)_auto]">
        <div className={`min-w-0 px-4 py-3 flex items-center justify-between gap-3 ${s.toolbar}`}>
          <div className="min-w-0">
            <Text as="h1" size={500} weight="semibold" className="!m-0 block">{t("dashboard.nav.playground")}</Text>
            <Text size={200} className="text-fui-fg2 block truncate">{selectedModel?.id ?? t("dashboard.playground.noModel")}</Text>
          </div>
          <Button appearance="subtle" disabled={!messages.length && !sending} onClick={clearMessages}>{t("dashboard.playground.actions.clear")}</Button>
        </div>
        <div className="px-4 py-3">
          <Field label={t("dashboard.playground.system")}>
            <Textarea resize="vertical" rows={2} value={system} placeholder={t("dashboard.playground.systemPlaceholder")} onChange={(_, data) => setSystem(data.value)} />
          </Field>
        </div>
        <div ref={scrollRef} className="min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3 [scrollbar-gutter:stable]">
          {loaderData.error && <MessageBar intent="error" className="!mb-3"><MessageBarBody>{loaderData.error}</MessageBarBody></MessageBar>}
          {requestError && <MessageBar intent="error" className="!mb-3"><MessageBarBody>{requestError}</MessageBarBody></MessageBar>}
          {!selectedKey ? <EmptyState text={t("dashboard.playground.noKey")} />
            : !selectedModel ? <EmptyState text={t("dashboard.playground.noModelForApi")} />
              : messages.length === 0 && !sending ? <EmptyState text={t("dashboard.playground.empty")} /> : null}
          <div className="grid gap-3">
            {messages.map((message) => (
              <div key={message.id} className={`flex min-w-0 ${message.role === "user" ? "justify-end" : "justify-start"} ${s.messageRow}`}>
                <div className="max-w-[78%] min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Text size={200} weight="semibold" className="text-fui-fg2">{t(`dashboard.playground.roles.${message.role}`)}</Text>
                    <div className={`playground-message-actions flex gap-0.5 ${s.messageActions}`}>
                      <IconAction label={t("dashboard.playground.actions.edit")} icon={<EditRegular />} onClick={() => beginEdit(message)} />
                      <IconAction label={t("dashboard.playground.actions.delete")} icon={<DeleteRegular />} onClick={() => removeMessage(message.id)} />
                    </div>
                  </div>
                  <div className={`rounded-md px-3 py-2.5 break-words overflow-hidden ${message.role === "user" ? s.userBubble : s.assistantBubble}`}>
                    {editingId === message.id ? (
                      <div className="grid gap-2">
                        <Textarea resize="vertical" rows={3} value={editText} onChange={(_, data) => setEditText(data.value)} />
                        {message.role === "user" && imageEnabled && <Input type="url" value={editImage} placeholder={t("dashboard.playground.imagePlaceholder")} onChange={(_, data) => setEditImage(data.value)} />}
                        <div className="flex justify-end gap-2">
                          <Button size="small" onClick={() => setEditingId(null)}>{t("common.cancel")}</Button>
                          <Button size="small" appearance="primary" disabled={!editText.trim() && !editImage.trim()} onClick={() => saveEdit(message.id)}>{t("dashboard.playground.actions.save")}</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {message.imageUrl && <a className="block text-fui-fg2 text-fui-base200 break-all mb-2" href={message.imageUrl} target="_blank" rel="noreferrer">{message.imageUrl}</a>}
                        <span className="whitespace-pre-wrap break-words">{message.text}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {sending && (!messages.length || messages[messages.length - 1]?.role === "user") && <Spinner size="tiny" label={t("dashboard.playground.generating")} />}
          </div>
        </div>
        <div className={`p-3 ${s.composer}`}>
          {showImage && <div className="flex gap-2 mb-2">
            <Input className="!min-w-0 !flex-1" type="url" value={imageUrl} placeholder={t("dashboard.playground.imagePlaceholder")} onChange={(_, data) => setImageUrl(data.value)} />
            <IconAction label={t("common.cancel")} icon={<DismissRegular />} onClick={() => { setImageUrl(""); setShowImage(false); }} />
          </div>}
          <div className="flex items-end gap-2">
            <Tooltip content={imageEnabled ? t("dashboard.playground.actions.image") : t("dashboard.playground.errors.imageUnsupported")} relationship="label">
              <Button appearance="subtle" aria-label={t("dashboard.playground.actions.image")} disabled={!imageEnabled || sending} icon={<ImageRegular />} onClick={() => setShowImage((value) => !value)} />
            </Tooltip>
            <Textarea className="!min-w-0 !flex-1" resize="vertical" rows={2} value={draft} disabled={sending} placeholder={t("dashboard.playground.messagePlaceholder")} onChange={(_, data) => setDraft(data.value)} onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
            }} />
            {sending
              ? <Button appearance="primary" icon={<StopRegular />} onClick={stop}>{t("dashboard.playground.actions.stop")}</Button>
              : <Button appearance="primary" icon={<SendRegular />} disabled={!canSend} onClick={() => void send()}>{t("dashboard.playground.actions.send")}</Button>}
          </div>
        </div>
      </div>

      <aside className={`min-h-0 overflow-y-auto overflow-x-hidden p-4 grid content-start gap-5 [scrollbar-gutter:stable] ${s.settings}`}>
        <SettingsSection title={t("dashboard.playground.settings.connection")}>
          <Field label={t("dashboard.playground.key")}>
            <Select value={keyId} disabled={!loaderData.keys.length} onChange={(_, data) => changeContext(() => setKeyId(data.value))}>
              {!loaderData.keys.length && <option value="">{t("dashboard.playground.noKeyOption")}</option>}
              {loaderData.keys.map((key) => <option key={key.id} value={key.id}>{key.name} ({key.key.slice(-4)})</option>)}
            </Select>
          </Field>
          <div className="grid gap-0.5">
            <Text weight="semibold">{t("dashboard.playground.api")}</Text>
            <SegmentedControl ariaLabel={t("dashboard.playground.api")} value={api} items={playgroundApis.map((value) => ({ value, label: t(`dashboard.playground.apis.${value}`) }))} onChange={(value) => changeContext(() => setApi(value as PlaygroundApi))} />
          </div>
          <Field label={t("dashboard.playground.model")}>
            <Combobox value={modelQuery || selectedModel?.display_name || ""} selectedOptions={selectedModel ? [selectedModel.id] : []} placeholder={t("dashboard.playground.modelPlaceholder")} onChange={(event) => setModelQuery(event.target.value)} onOptionSelect={(_, data) => {
              if (!data.optionValue) return;
              changeContext(() => { setModelId(data.optionValue!); setModelQuery(""); });
            }} onOpenChange={(_, data) => { if (!data.open) setModelQuery(""); }}>
              {matchingModels.map((model) => <Option key={model.id} value={model.id} text={model.display_name}><div className="min-w-0"><div className="truncate">{model.display_name}</div><div className={`text-fui-fg2 text-fui-base200 truncate ${s.code}`}>{model.id}</div></div></Option>)}
            </Combobox>
          </Field>
          <Switch checked={streaming} label={t("dashboard.playground.streaming")} onChange={(_, data) => { stop(); setStreaming(data.checked); }} />
        </SettingsSection>

        <SettingsSection title={t("dashboard.playground.settings.generation")}>
          <OptionalNumber label={t("dashboard.playground.parameters.temperature")} value={settings.temperature} min={0} max={2} step={0.1} onChange={(value) => setSettings((current) => ({ ...current, temperature: value }))} />
          <OptionalNumber label={t("dashboard.playground.parameters.maxOutputTokens")} value={settings.maxOutputTokens} min={1} max={outputLimit} step={1} onChange={(value) => setSettings((current) => ({ ...current, maxOutputTokens: value }))} />
          <OptionalNumber label={t("dashboard.playground.parameters.topP")} value={settings.topP} min={0} max={1} step={0.05} onChange={(value) => setSettings((current) => ({ ...current, topP: value }))} />
          <OptionalNumber label={t("dashboard.playground.parameters.frequencyPenalty")} value={settings.frequencyPenalty} disabled={api === "messages"} min={-2} max={2} step={0.1} onChange={(value) => setSettings((current) => ({ ...current, frequencyPenalty: value }))} />
          <OptionalNumber label={t("dashboard.playground.parameters.presencePenalty")} value={settings.presencePenalty} disabled={api === "messages"} min={-2} max={2} step={0.1} onChange={(value) => setSettings((current) => ({ ...current, presencePenalty: value }))} />
          <Field label={t("dashboard.playground.parameters.stopSequences")}>
            <Input value={settings.stopSequences?.join(", ") ?? ""} placeholder={t("dashboard.playground.parameters.unset")} onChange={(_, data) => setSettings((current) => ({ ...current, stopSequences: data.value.split(",").map((value) => value.trim()).filter(Boolean) || undefined }))} />
          </Field>
          <Field label={t("dashboard.playground.parameters.reasoningEffort")}>
            <Select value={settings.reasoningEffort ?? ""} disabled={!effortOptions.length} onChange={(_, data) => setSettings((current) => ({ ...current, reasoningEffort: data.value || undefined }))}>
              <option value="">{t("dashboard.playground.parameters.providerDefault")}</option>
              {effortOptions.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
            </Select>
          </Field>
        </SettingsSection>

        <SettingsSection title={t("dashboard.playground.settings.customJson")}>
          <Field validationState={customError ? "error" : "none"} validationMessage={customError ?? undefined} hint={t("dashboard.playground.customJsonHint")}>
            <Textarea className={s.code} resize="vertical" rows={9} value={customDrafts[api]} onChange={(_, data) => {
              setCustomDrafts((current) => ({ ...current, [api]: data.value }));
              setCustomError(null);
            }} />
          </Field>
        </SettingsSection>
      </aside>
    </section>
  );
}

function SettingsSection({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="grid gap-3 min-w-0"><Text as="h2" size={300} weight="semibold" className="!m-0">{title}</Text>{children}</section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="h-full min-h-[180px] grid place-items-center text-center px-6"><Text className="text-fui-fg2">{text}</Text></div>;
}

function IconAction({ icon, label, onClick }: { icon: React.ReactElement; label: string; onClick: () => void }) {
  return <Tooltip content={label} relationship="label"><Button appearance="subtle" aria-label={label} icon={icon} size="small" onClick={onClick} /></Tooltip>;
}

function OptionalNumber({ disabled, label, max, min, onChange, step, value }: {
  disabled?: boolean; label: string; max?: number; min: number; onChange: (value: number | undefined) => void; step: number; value?: number;
}) {
  const { t } = useTranslation();
  return <div className="grid grid-cols-[minmax(0,1fr)_116px] items-end gap-2 min-w-0">
    <Switch checked={value !== undefined} disabled={disabled} label={label} onChange={(_, data) => onChange(data.checked ? min : undefined)} />
    <SpinButton aria-label={label} disabled={disabled || value === undefined} value={value ?? null} min={min} max={max} step={step} placeholder={t("dashboard.playground.parameters.unset")} onChange={(_, data) => {
      const next = data.value ?? (data.displayValue ? Number(data.displayValue) : undefined);
      if (next !== undefined && Number.isFinite(next)) onChange(next);
    }} />
  </div>;
}
