import { useTranslation } from "react-i18next";
import { ArrowUpRight16Regular } from "@fluentui/react-icons";

import { fluentComponents } from "../fluent";
import styles from "./dashboard-services-api-docs.module.css";

const { Card } = fluentComponents;

type EndpointRow = {
  method: "GET" | "POST";
  path: string;
  name: string;
  docs: string;
};

// Static reference for the public gateway endpoints exposed by Floway.
const endpoints: EndpointRow[] = [
  {
    method: "POST",
    path: "/v1/messages",
    name: "Anthropic Messages",
    docs: "https://docs.anthropic.com/en/api/messages",
  },
  {
    method: "POST",
    path: "/v1/messages/count_tokens",
    name: "Anthropic Count Tokens",
    docs: "https://docs.anthropic.com/en/api/messages-count-tokens",
  },
  {
    method: "POST",
    path: "/v1/responses",
    name: "OpenAI Responses",
    docs: "https://platform.openai.com/docs/api-reference/responses/create",
  },
  {
    method: "POST",
    path: "/v1/responses/compact",
    name: "OpenAI Responses Compact",
    docs: "https://platform.openai.com/docs/api-reference/responses/compact",
  },
  {
    method: "GET",
    path: "/v1/responses",
    name: "OpenAI Responses (WebSocket)",
    docs: "https://developers.openai.com/api/docs/guides/websocket-mode",
  },
  {
    method: "POST",
    path: "/v1/chat/completions",
    name: "OpenAI Chat Completions",
    docs: "https://platform.openai.com/docs/api-reference/chat/create",
  },
  {
    method: "POST",
    path: "/v1/embeddings",
    name: "OpenAI Embeddings",
    docs: "https://platform.openai.com/docs/api-reference/embeddings/create",
  },
  {
    method: "POST",
    path: "/v1/images/generations",
    name: "OpenAI Image Generations",
    docs: "https://platform.openai.com/docs/api-reference/images/create",
  },
  {
    method: "POST",
    path: "/v1/images/edits",
    name: "OpenAI Image Edits",
    docs: "https://platform.openai.com/docs/api-reference/images/createEdit",
  },
  {
    method: "GET",
    path: "/v1/models",
    name: "OpenAI Models",
    docs: "https://platform.openai.com/docs/api-reference/models/list",
  },
  {
    method: "POST",
    path: "/v1beta/models/{model}:{action}",
    name: "Google Gemini",
    docs: "https://ai.google.dev/api/generate-content",
  },
];

export function meta() {
  return [{ title: "API Docs | Floway" }];
}

export default function DashboardServicesApiDocs() {
  const { t } = useTranslation();

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p>{t("dashboard.groups.services")}</p>
        <h1>{t("dashboard.nav.apiDocs")}</h1>
      </header>

      <Card className={styles.panel}>
        <h2>{t("dashboard.apiDocs.endpointsTitle")}</h2>
        <div className={styles.endpointList}>
          {endpoints.map((endpoint) => (
            <div
              className={styles.endpointRow}
              key={`${endpoint.method} ${endpoint.path}`}
            >
              <span
                className={
                  endpoint.method === "GET"
                    ? styles.methodGet
                    : styles.methodPost
                }
              >
                {endpoint.method}
              </span>
              <code className={styles.path}>{endpoint.path}</code>
              <span className={styles.name}>{endpoint.name}</span>
              <a
                className={styles.docsLink}
                href={endpoint.docs}
                rel="noreferrer"
                target="_blank"
              >
                {t("dashboard.apiDocs.docsLink")}
                <ArrowUpRight16Regular aria-hidden="true" />
              </a>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
