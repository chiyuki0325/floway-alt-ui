import { redirect } from "react-router";
import { useTranslation } from "react-i18next";

import type { Route } from "./+types/dashboard-settings";
import { getCurrentSession } from "../api/auth";
import { FlowayLogo } from "../components/floway-logo";
import { fluentComponents } from "../fluent";
import { getSessionToken } from "../auth/session";
import styles from "./dashboard-settings.module.css";

const { Badge, Card, Spinner } = fluentComponents;

export async function clientLoader() {
  if (!getSessionToken()) throw redirect("/");

  const result = await getCurrentSession();
  if (result.error) {
    if (result.error.status === 401) throw redirect("/");
    return { user: null, error: result.error.message };
  }

  return { user: result.data.user, error: null };
}

clientLoader.hydrate = true as const;

export function HydrateFallback() {
  const { t } = useTranslation();

  return (
    <main className="floway-page-shell floway-page-shell--centered">
      <Spinner label={t("common.loading")} />
    </main>
  );
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Settings | Floway" }];
}

export default function DashboardSettings({
  loaderData,
}: Route.ComponentProps) {
  const { t } = useTranslation();
  const { user, error } = loaderData;

  return (
    <main className="floway-page-shell">
      <section className={styles.placeholder}>
        <FlowayLogo size="compact" />
        <Card className={styles.panel}>
          <div className={styles.heading}>
            <p>{t("dashboard.settings.title")}</p>
            <h1>{t("dashboard.settings.heading")}</h1>
          </div>

          {user ? (
            <div className={styles.body}>
              <p>{t("dashboard.settings.intro")}</p>
              <div className={styles.badges}>
                <Badge appearance="filled">
                  {t("dashboard.settings.signedInAs", {
                    username: user.username,
                  })}
                </Badge>
                <Badge appearance="tint" color={user.isAdmin ? "brand" : "subtle"}>
                  {user.isAdmin
                    ? t("dashboard.settings.admin")
                    : t("dashboard.settings.operator")}
                </Badge>
                <Badge appearance="outline">
                  {user.canViewGlobalTelemetry
                    ? t("dashboard.settings.telemetryAllowed")
                    : t("dashboard.settings.telemetryScoped")}
                </Badge>
              </div>
            </div>
          ) : (
            <p className={styles.error}>{error}</p>
          )}
        </Card>
      </section>
    </main>
  );
}
