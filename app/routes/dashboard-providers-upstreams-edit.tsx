import { ArrowLeftRegular } from "@fluentui/react-icons";
import { redirect, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import type { Route } from "./+types/dashboard-providers-upstreams-edit";
import { getCurrentSession } from "../api/auth";
import { getSessionToken } from "../auth/session";
import { Panel } from "../components/panel";
import { fluentComponents } from "../fluent";

const { Button, Text } = fluentComponents;

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!getSessionToken()) throw redirect("/");
  const session = await getCurrentSession();
  if (session.error || !session.data.user.isAdmin) {
    throw redirect("/dashboard/services/api-keys");
  }
  return { id: params.id };
}

export function meta({}: Route.MetaArgs) {
  return [{ title: "Edit Upstream | Floway" }];
}

export default function DashboardProvidersUpstreamsEdit({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="grid gap-[18px] min-w-0">
      <Button appearance="subtle" className="!justify-self-start" icon={<ArrowLeftRegular />} onClick={() => navigate("/dashboard/providers/upstreams")}>
        {t("dashboard.upstreams.placeholder.back")}
      </Button>
      <Panel className="grid gap-3 min-w-0 !p-[22px]">
        <Text as="h1" size={600} weight="semibold" className="!m-0">
          {t("dashboard.upstreams.placeholder.editTitle")}
        </Text>
        <Text size={300} className="text-fui-fg2">
          {t("dashboard.upstreams.placeholder.description")}
        </Text>
        <code className="text-fui-fg2 text-xs">{loaderData.id}</code>
      </Panel>
    </div>
  );
}
