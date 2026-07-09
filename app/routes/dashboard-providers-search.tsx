import { DashboardPlaceholder } from "../components/dashboard-placeholder";

export function meta() {
  return [{ title: "Provider Search | Floway" }];
}

export default function DashboardProvidersSearch() {
  return (
    <DashboardPlaceholder
      eyebrowKey="dashboard.groups.providers"
      titleKey="dashboard.nav.search"
      descriptionKey="dashboard.pages.search"
      requireAdmin
    />
  );
}
