import { DashboardPlaceholder } from "../components/dashboard-placeholder";

export function meta() {
  return [{ title: "Upstreams | Floway" }];
}

export default function DashboardProvidersUpstreams() {
  return (
    <DashboardPlaceholder
      eyebrowKey="dashboard.groups.providers"
      titleKey="dashboard.nav.upstreams"
      descriptionKey="dashboard.pages.upstreams"
      readonlyForOperator
    />
  );
}
