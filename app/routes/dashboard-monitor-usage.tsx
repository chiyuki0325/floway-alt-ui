import { DashboardPlaceholder } from "../components/dashboard-placeholder";

export function meta() {
  return [{ title: "Usage | Floway" }];
}

export default function DashboardMonitorUsage() {
  return (
    <DashboardPlaceholder
      eyebrowKey="dashboard.groups.monitor"
      titleKey="dashboard.nav.usage"
      descriptionKey="dashboard.pages.usage"
    />
  );
}
