import { useTranslation } from "react-i18next";

import { fluentComponents } from "../fluent";
import { useDashboardOutletContext } from "../routes/dashboard";
import { Panel } from "./panel";

const { Text } = fluentComponents;

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
    <section className="grid gap-[18px] max-w-[960px] min-w-0">
      <header className="grid gap-[6px]">
        <Text size={200} weight="semibold" className="text-fui-fg2 leading-[1.2] uppercase">
          {t(eyebrowKey)}
        </Text>
        <Text size={700} weight="semibold">
          {t(titleKey)}
        </Text>
      </header>
      <Panel className="!p-[22px_24px]">
        <div className="grid gap-[10px] max-w-[680px]">
          {blocked ? (
            <>
              <Text size={300} weight="semibold" style={{ color: "light-dark(#0f6cbd, #75b6f7)" }}>
                {t("dashboard.pages.adminOnly")}
              </Text>
              <Text size={300} className="text-fui-fg3">
                {t("dashboard.pages.adminOnlyDescription")}
              </Text>
            </>
          ) : (
            <>
              <Text size={300} className="text-fui-fg3">
                {t(descriptionKey)}
              </Text>
              {readonlyForOperator && !user.isAdmin && (
                <Text size={300} weight="semibold" style={{ color: "light-dark(#0f6cbd, #75b6f7)" }}>
                  {t("dashboard.pages.readonly")}
                </Text>
              )}
            </>
          )}
        </div>
      </Panel>
    </section>
  );
}
