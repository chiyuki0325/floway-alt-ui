import { DashboardPlaceholder } from "../components/dashboard-placeholder";

export function meta() {
  return [{ title: "API Docs | Floway" }];
}

export default function DashboardServicesApiDocs() {
  return (
    <DashboardPlaceholder
      eyebrowKey="dashboard.groups.services"
      titleKey="dashboard.nav.apiDocs"
      descriptionKey="dashboard.pages.apiDocs"
    />
  );
}
