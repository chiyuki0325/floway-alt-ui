import { DashboardPlaceholder } from "../components/dashboard-placeholder";

export function meta() {
  return [{ title: "Performance | Floway" }];
}

export default function DashboardMonitorPerformance() {
  return (
    <DashboardPlaceholder
      eyebrowKey="dashboard.groups.monitor"
      titleKey="dashboard.nav.performance"
      descriptionKey="dashboard.pages.performance"
    />
  );
}
