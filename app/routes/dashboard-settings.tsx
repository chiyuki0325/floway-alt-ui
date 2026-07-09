import { useTranslation } from "react-i18next";

import { fluentComponents } from "../fluent";
import { useDashboardOutletContext } from "./dashboard";
import styles from "./dashboard-settings.module.css";

const { Badge, Card } = fluentComponents;

export function meta() {
  return [{ title: "Settings | Floway" }];
}

export default function DashboardSettings() {
  const { t } = useTranslation();
  const { user } = useDashboardOutletContext();

  return (
    <section className={styles.placeholder}>
      <Card className={styles.panel}>
        <div className={styles.heading}>
          <p>{t("dashboard.settings.title")}</p>
          <h1>{t("dashboard.settings.heading")}</h1>
        </div>

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
      </Card>
    </section>
  );
}
