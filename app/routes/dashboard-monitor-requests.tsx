import { DashboardPlaceholder } from "../components/dashboard-placeholder";

export function meta() {
  return [{ title: "Requests | Floway" }];
}

export default function DashboardMonitorRequests() {
  return (
    <DashboardPlaceholder
      eyebrowKey="dashboard.groups.monitor"
      titleKey="dashboard.nav.requests"
      descriptionKey="dashboard.pages.requests"
    />
  );
}
