import { DashboardPlaceholder } from "../components/dashboard-placeholder";

export function meta() {
  return [{ title: "API Keys | Floway" }];
}

export default function DashboardServicesApiKeys() {
  return (
    <DashboardPlaceholder
      eyebrowKey="dashboard.groups.services"
      titleKey="dashboard.nav.apiKeys"
      descriptionKey="dashboard.pages.apiKeys"
    />
  );
}
