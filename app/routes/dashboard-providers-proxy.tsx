import { DashboardPlaceholder } from "../components/dashboard-placeholder";

export function meta() {
  return [{ title: "Proxy | Floway" }];
}

export default function DashboardProvidersProxy() {
  return (
    <DashboardPlaceholder
      eyebrowKey="dashboard.groups.providers"
      titleKey="dashboard.nav.proxy"
      descriptionKey="dashboard.pages.proxy"
      requireAdmin
    />
  );
}
