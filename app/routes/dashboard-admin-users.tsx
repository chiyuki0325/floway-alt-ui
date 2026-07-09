import { DashboardPlaceholder } from "../components/dashboard-placeholder";

export function meta() {
  return [{ title: "Users | Floway" }];
}

export default function DashboardAdminUsers() {
  return (
    <DashboardPlaceholder
      eyebrowKey="dashboard.groups.admin"
      titleKey="dashboard.nav.users"
      descriptionKey="dashboard.pages.users"
      requireAdmin
    />
  );
}
