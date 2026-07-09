import { DashboardPlaceholder } from "../components/dashboard-placeholder";

export function meta() {
  return [{ title: "Playground | Floway" }];
}

export default function DashboardPlayground() {
  return (
    <DashboardPlaceholder
      eyebrowKey="dashboard.groups.console"
      titleKey="dashboard.nav.playground"
      descriptionKey="dashboard.pages.playground"
    />
  );
}
