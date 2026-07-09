import { useTranslation } from "react-i18next";

import { useDashboardOutletContext } from "../routes/dashboard";
import styles from "./dashboard-placeholder.module.css";

interface DashboardPlaceholderProps {
  titleKey: string;
  eyebrowKey: string;
  descriptionKey: string;
  requireAdmin?: boolean;
  readonlyForOperator?: boolean;
}

export function DashboardPlaceholder({
  titleKey,
  eyebrowKey,
  descriptionKey,
  requireAdmin = false,
  readonlyForOperator = false,
}: DashboardPlaceholderProps) {
  const { t } = useTranslation();
  const { user } = useDashboardOutletContext();
  const blocked = requireAdmin && !user.isAdmin;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p>{t(eyebrowKey)}</p>
        <h1>{t(titleKey)}</h1>
      </header>
      <div className={styles.panel}>
        {blocked ? (
          <div className={styles.body}>
            <p className={styles.status}>{t("dashboard.pages.adminOnly")}</p>
            <p>{t("dashboard.pages.adminOnlyDescription")}</p>
          </div>
        ) : (
          <div className={styles.body}>
            <p>{t(descriptionKey)}</p>
            {readonlyForOperator && !user.isAdmin && (
              <p className={styles.status}>{t("dashboard.pages.readonly")}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
